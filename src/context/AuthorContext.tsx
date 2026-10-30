import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { generateApplicationId } from '../lib/id';
import { 
  loadAuthorApplications, 
  saveAuthorApplications, 
  loadAuthorizedAuthors, 
  saveAuthorizedAuthors 
} from '../lib/storage';
import { 
  authorizeAuthorOnChain, 
  deauthorizeAuthorOnChain,
  submitAuthorApplicationOnChain,
  reviewAuthorApplicationOnChain
} from '../services/contractService';
import { useWallet } from './WalletContext';
import { useDocuments } from './DocumentContext';
import type { 
  AuthorApplication, 
  AuthorizedAuthorRecord, 
  ApplicationStatus
} from '../types';

export interface SubmitApplicationParams {
  applicantName: string;
  organization: string;
  licenseNumber: string;
  contactEmail: string;
  justification: string;
}

interface AuthorContextType {
  applications: AuthorApplication[];
  authorizedAuthors: AuthorizedAuthorRecord[];
  pendingApplicationsCount: number;
  submitApplication: (params: SubmitApplicationParams, rawProvider?: any) => Promise<AuthorApplication>;
  reviewApplication: (
    appId: string, 
    decision: 'Approved' | 'Rejected', 
    notes?: string, 
    rawProvider?: any
  ) => Promise<boolean>;
  deauthorizeAuthor: (walletAddress: string, reason?: string, rawProvider?: any) => Promise<boolean>;
  isApplicantPending: (walletAddress?: string | null) => boolean;
  getApplicationByWallet: (walletAddress?: string | null) => AuthorApplication | undefined;
}

const AuthorContext = createContext<AuthorContextType | undefined>(undefined);

export const AuthorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { 
    address, 
    isSuperAuthor, 
    selectedNetwork, 
    refreshAuthorRoles 
  } = useWallet();
  const { addToast } = useDocuments();

  const [applications, setApplications] = useState<AuthorApplication[]>(() => loadAuthorApplications());
  const [authorizedAuthors, setAuthorizedAuthors] = useState<AuthorizedAuthorRecord[]>(() => loadAuthorizedAuthors());

  // Save to persistent storage whenever updated
  useEffect(() => {
    saveAuthorApplications(applications);
  }, [applications]);

  useEffect(() => {
    saveAuthorizedAuthors(authorizedAuthors);
  }, [authorizedAuthors]);

  const pendingApplicationsCount = applications.filter(a => a.status === 'Pending').length;

  const isApplicantPending = (walletAddress?: string | null): boolean => {
    if (!walletAddress) return false;
    const clean = walletAddress.trim().toLowerCase();
    return applications.some(a => a.applicantWallet.toLowerCase() === clean && a.status === 'Pending');
  };

  const getApplicationByWallet = (walletAddress?: string | null): AuthorApplication | undefined => {
    if (!walletAddress) return undefined;
    const clean = walletAddress.trim().toLowerCase();
    return applications.find(a => a.applicantWallet.toLowerCase() === clean);
  };

  const submitApplication = async (
    params: SubmitApplicationParams,
    rawProvider?: any
  ): Promise<AuthorApplication> => {
    if (!address) {
      throw new Error('Please connect your BridgeKey or EVM wallet to submit an author application.');
    }

    const cleanWallet = address.trim().toLowerCase();

    // Check for duplicate pending applications
    const existingPending = applications.find(
      a => a.applicantWallet.toLowerCase() === cleanWallet && a.status === 'Pending'
    );
    if (existingPending) {
      throw new Error(`A pending author application (${existingPending.id}) is already registered for wallet ${address.slice(0, 6)}...${address.slice(-4)}. Please await review by the Super Author.`);
    }

    // Check if already an active authorized author
    const alreadyAuthor = authorizedAuthors.find(
      a => a.walletAddress.toLowerCase() === cleanWallet && a.isActive
    );
    if (alreadyAuthor) {
      throw new Error('This wallet is already an active authorized Secondary Author.');
    }

    const appId = generateApplicationId();
    let submissionTxHash: string | undefined = undefined;

    // If wallet provider is available, attempt on-chain registration on supported contract
    if (rawProvider) {
      const chainRes = await submitAuthorApplicationOnChain(
        appId,
        params.applicantName.trim(),
        params.organization.trim(),
        params.contactEmail.trim(),
        params.justification.trim(),
        rawProvider,
        selectedNetwork
      );
      if (chainRes.success && chainRes.txHash) {
        submissionTxHash = chainRes.txHash;
        addToast(
          'On-Chain Application Submitted',
          `Application recorded on ${selectedNetwork}. Tx: ${chainRes.txHash.slice(0, 10)}...`,
          'success'
        );
      } else if (chainRes.error) {
        addToast(
          'Application Notice',
          `On-chain submission: ${chainRes.error}. Application stored locally for workflow.`,
          'info'
        );
      }
    }

    const newApp: AuthorApplication = {
      id: appId,
      applicantWallet: address,
      applicantName: params.applicantName.trim(),
      organization: params.organization.trim(),
      licenseNumber: params.licenseNumber.trim(),
      contactEmail: params.contactEmail.trim(),
      justification: params.justification.trim(),
      submittedAt: new Date().toISOString(),
      status: 'Pending',
      submissionTxHash,
      networkKey: selectedNetwork,
    };

    setApplications(prev => [newApp, ...prev]);

    addToast(
      'Application Submitted',
      `Application ${newApp.id} submitted for Super Author review.`,
      'success'
    );

    return newApp;
  };

  const reviewApplication = async (
    appId: string,
    decision: 'Approved' | 'Rejected',
    notes?: string,
    rawProvider?: any
  ): Promise<boolean> => {
    if (!isSuperAuthor) {
      throw new Error('Unauthorized Caller: Only the designated Super Author can review author applications.');
    }

    const targetApp = applications.find(a => a.id === appId);
    if (!targetApp) {
      throw new Error(`Application ${appId} not found.`);
    }

    let approvalTxHash: string | undefined = undefined;

    if (rawProvider) {
      // Try reviewAuthorApplicationOnChain first
      let chainRes = await reviewAuthorApplicationOnChain(
        targetApp.applicantWallet,
        decision === 'Approved',
        notes || '',
        rawProvider,
        selectedNetwork
      );

      // If contract does not have reviewAuthorApplication, fallback to direct authorizeAuthorOnChain for approval
      if (!chainRes.success && decision === 'Approved') {
        chainRes = await authorizeAuthorOnChain(targetApp.applicantWallet, rawProvider, selectedNetwork);
      }

      if (chainRes.success && chainRes.txHash) {
        approvalTxHash = chainRes.txHash;
        addToast(
          decision === 'Approved' ? 'On-Chain Author Authorized' : 'On-Chain Review Broadcast',
          `Broadcasted to ${selectedNetwork}. Tx: ${chainRes.txHash.slice(0, 10)}...`,
          'success'
        );
      } else if (chainRes.error) {
        addToast(
          'Smart Contract Notice',
          `On-chain call: ${chainRes.error}. Role assignment updated locally.`,
          'info'
        );
      }
    }

    if (decision === 'Approved') {
      // Add to Authorized Authors list
      const newAuthorRecord: AuthorizedAuthorRecord = {
        walletAddress: targetApp.applicantWallet,
        name: targetApp.applicantName,
        organization: targetApp.organization,
        licenseNumber: targetApp.licenseNumber,
        role: 'secondary_author',
        authorizedAt: new Date().toISOString(),
        authorizedBy: address || 'Super Author',
        txHash: approvalTxHash,
        isActive: true,
        networkKey: selectedNetwork,
      };

      setAuthorizedAuthors(prev => {
        const filtered = prev.filter(a => a.walletAddress.toLowerCase() !== targetApp.applicantWallet.toLowerCase());
        const updated = [newAuthorRecord, ...filtered];
        saveAuthorizedAuthors(updated);
        return updated;
      });

      // Update role cache in wallet context
      refreshAuthorRoles();
    }

    // Update application record
    setApplications(prev => prev.map(a => {
      if (a.id === appId) {
        return {
          ...a,
          status: decision as ApplicationStatus,
          reviewedAt: new Date().toISOString(),
          reviewedBy: address || 'Super Author',
          reviewNotes: notes?.trim() || undefined,
          approvalTxHash: approvalTxHash || a.approvalTxHash,
        };
      }
      return a;
    }));

    addToast(
      `Application ${decision}`,
      `Application ${appId} for ${targetApp.applicantName} marked as ${decision}.`,
      decision === 'Approved' ? 'success' : 'warning'
    );

    return true;
  };

  const deauthorizeAuthor = async (
    walletAddress: string,
    reason?: string,
    rawProvider?: any
  ): Promise<boolean> => {
    if (!isSuperAuthor) {
      throw new Error('Unauthorized Caller: Only the designated Super Author can revoke author permissions.');
    }

    const clean = walletAddress.trim().toLowerCase();
    const existing = authorizedAuthors.find(a => a.walletAddress.toLowerCase() === clean);
    if (!existing) {
      throw new Error('Author not found.');
    }

    if (rawProvider) {
      const chainRes = await deauthorizeAuthorOnChain(walletAddress, rawProvider, selectedNetwork);
      if (chainRes.success && chainRes.txHash) {
        addToast(
          'On-Chain Deauthorization Confirmed',
          `Revoked on ${selectedNetwork}. Tx: ${chainRes.txHash.slice(0, 10)}...`,
          'info'
        );
      }
    }

    setAuthorizedAuthors(prev => prev.map(a => {
      if (a.walletAddress.toLowerCase() === clean) {
        return {
          ...a,
          isActive: false,
        };
      }
      return a;
    }));

    refreshAuthorRoles();

    addToast(
      'Author Permissions Revoked',
      `Deauthorized Secondary Author ${existing.name} (${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)})${reason ? ` (${reason})` : ''}.`,
      'warning'
    );

    return true;
  };

  return (
    <AuthorContext.Provider
      value={{
        applications,
        authorizedAuthors,
        pendingApplicationsCount,
        submitApplication,
        reviewApplication,
        deauthorizeAuthor,
        isApplicantPending,
        getApplicationByWallet,
      }}
    >
      {children}
    </AuthorContext.Provider>
  );
};

export const useAuthors = (): AuthorContextType => {
  const context = useContext(AuthorContext);
  if (!context) {
    throw new Error('useAuthors must be used within an AuthorProvider');
  }
  return context;
};
