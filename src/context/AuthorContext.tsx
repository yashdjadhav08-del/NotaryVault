import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { generateApplicationId } from '../lib/id';
import { 
  loadAuthorApplications, 
  saveAuthorApplications, 
  loadAuthorizedAuthors, 
  saveAuthorizedAuthors 
} from '../lib/storage';
import { 
  deauthorizeAuthorOnChain,
  submitAuthorApplicationOnChain,
  reviewAuthorApplicationOnChain,
  fetchAllOnChainAuthorApplications,
  getOnChainApplicationStatus,
  isContractConfigured,
  isChainIdMatchingNetwork,
  MST_NETWORKS
} from '../services/contractService';
import type { MSTNetworkKey } from '../services/contractService';
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
  isSyncingOnChain: boolean;
  syncError: string | null;
  syncOnChainApplications: (targetNet?: MSTNetworkKey) => Promise<AuthorApplication[]>;
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
    chainId: walletChainId,
    isSuperAuthor, 
    selectedNetwork, 
    refreshAuthorRoles 
  } = useWallet();
  const { addToast } = useDocuments();

  const [applications, setApplications] = useState<AuthorApplication[]>(() => loadAuthorApplications(selectedNetwork));
  const [authorizedAuthors, setAuthorizedAuthors] = useState<AuthorizedAuthorRecord[]>(() => loadAuthorizedAuthors(selectedNetwork));
  const [isSyncingOnChain, setIsSyncingOnChain] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Save to persistent storage whenever updated for the active network
  useEffect(() => {
    saveAuthorApplications(applications, selectedNetwork);
  }, [applications, selectedNetwork]);

  useEffect(() => {
    saveAuthorizedAuthors(authorizedAuthors, selectedNetwork);
  }, [authorizedAuthors, selectedNetwork]);

  /**
   * Syncs applications with the on-chain registry contract.
   * On-chain records from the blockchain are authoritative.
   * Any off-chain-only local records are preserved but marked isOnChain: false.
   */
  const syncOnChainApplications = useCallback(async (
    targetNet: MSTNetworkKey = selectedNetwork
  ): Promise<AuthorApplication[]> => {
    if (!isContractConfigured(targetNet)) {
      setIsSyncingOnChain(false);
      setSyncError(null);
      const localOnly = loadAuthorApplications(targetNet);
      setApplications(localOnly);
      return localOnly;
    }

    setIsSyncingOnChain(true);
    setSyncError(null);

    try {
      const res = await fetchAllOnChainAuthorApplications(targetNet);
      if (!res.success) {
        setSyncError(res.error || 'Failed to sync applications from blockchain node.');
        setIsSyncingOnChain(false);
        return applications;
      }

      const onChainApps = res.applications;
      const onChainWallets = new Set(onChainApps.map(a => a.applicantWallet.toLowerCase()));

      // Read current local storage applications for targetNet
      const localApps = loadAuthorApplications(targetNet);

      // Merge: on-chain records supersede local drafts for same wallet
      const merged: AuthorApplication[] = [...onChainApps];

      for (const loc of localApps) {
        const cleanLocWallet = loc.applicantWallet.toLowerCase();
        if (!onChainWallets.has(cleanLocWallet)) {
          // Off-chain only application (e.g. historical unsubmitted draft)
          merged.push({
            ...loc,
            networkKey: targetNet,
            isOnChain: false,
            submissionTxHash: loc.submissionTxHash || undefined,
          });
        }
      }

      setApplications(merged);
      saveAuthorApplications(merged, targetNet);

      // Auto-update authorized authors if any on-chain application is approved
      for (const app of onChainApps) {
        if (app.status === 'Approved') {
          setAuthorizedAuthors(prev => {
            const cleanAppWallet = app.applicantWallet.toLowerCase();
            const exists = prev.some(a => a.walletAddress.toLowerCase() === cleanAppWallet && a.isActive);
            if (!exists) {
              const newRec: AuthorizedAuthorRecord = {
                walletAddress: app.applicantWallet,
                name: app.applicantName,
                organization: app.organization,
                licenseNumber: app.licenseNumber,
                role: 'secondary_author',
                authorizedAt: app.reviewedAt || app.submittedAt,
                authorizedBy: app.reviewedBy || 'Super Author',
                txHash: app.approvalTxHash,
                isActive: true,
                networkKey: targetNet,
              };
              const updated = [newRec, ...prev.filter(a => a.walletAddress.toLowerCase() !== cleanAppWallet)];
              saveAuthorizedAuthors(updated, targetNet);
              return updated;
            }
            return prev;
          });
        }
      }

      setIsSyncingOnChain(false);
      return merged;
    } catch (err: any) {
      setSyncError(err?.message || 'Error syncing on-chain applications');
      setIsSyncingOnChain(false);
      return applications;
    }
  }, [selectedNetwork, applications]);

  // Reactive reload and sync whenever selected network changes
  useEffect(() => {
    setApplications(loadAuthorApplications(selectedNetwork));
    setAuthorizedAuthors(loadAuthorizedAuthors(selectedNetwork));
    if (isContractConfigured(selectedNetwork)) {
      syncOnChainApplications(selectedNetwork);
    } else {
      setIsSyncingOnChain(false);
      setSyncError(null);
    }
  }, [selectedNetwork]);

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
      throw new Error('Please connect your wallet to submit an author application.');
    }

    if (!rawProvider) {
      throw new Error('Wallet connection provider is required to broadcast on-chain author application transaction.');
    }

    if (!isContractConfigured(selectedNetwork)) {
      if (selectedNetwork === 'mainnet') {
        throw new Error(
          'MAINNET CONTRACT NOT DEPLOYED/CONFIGURED: Smart contract has not been deployed to MST Chain Mainnet (Chain ID 4646). Author applications cannot proceed.'
        );
      }
      throw new Error(`Smart contract is not configured on ${MST_NETWORKS[selectedNetwork].name}.`);
    }

    if (walletChainId && !isChainIdMatchingNetwork(walletChainId, selectedNetwork)) {
      throw new Error(
        `Wallet network mismatch. Connected to chain ID ${walletChainId}, but selected network is ${MST_NETWORKS[selectedNetwork].name} (${MST_NETWORKS[selectedNetwork].chainIdDecimal}). Please switch networks in your wallet before submitting.`
      );
    }

    const cleanWallet = address.trim().toLowerCase();

    // Check if already an active authorized author
    const alreadyAuthor = authorizedAuthors.find(
      a => a.walletAddress.toLowerCase() === cleanWallet && a.isActive
    );
    if (alreadyAuthor) {
      throw new Error('This wallet is already an active authorized Secondary Author.');
    }

    // Check on-chain status to prevent duplicate reverts
    const onChainStatus = await getOnChainApplicationStatus(address, selectedNetwork);
    if (onChainStatus === 1) { // 1 = Pending
      throw new Error(`A pending author application is already registered on-chain for wallet ${address.slice(0, 6)}...${address.slice(-4)}. Please await review by the Super Author.`);
    }

    const appId = generateApplicationId();

    // Submit strictly on-chain; require confirmed receipt
    const chainRes = await submitAuthorApplicationOnChain(
      appId,
      params.applicantName.trim(),
      params.organization.trim(),
      params.contactEmail.trim(),
      params.justification.trim(),
      rawProvider,
      selectedNetwork
    );

    if (!chainRes.success || !chainRes.txHash) {
      throw new Error(chainRes.error || 'Blockchain transaction was rejected or reverted. Application was not submitted.');
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
      submissionTxHash: chainRes.txHash,
      submissionBlockNumber: chainRes.blockNumber,
      networkKey: selectedNetwork,
      isOnChain: true,
    };

    setApplications(prev => {
      const updated = [newApp, ...prev.filter(a => a.applicantWallet.toLowerCase() !== cleanWallet)];
      saveAuthorApplications(updated, selectedNetwork);
      return updated;
    });

    addToast(
      'Application Submitted On-Chain',
      `Application ${newApp.id} confirmed on ${selectedNetwork}. Block: ${chainRes.blockNumber || 'confirmed'}. Tx: ${chainRes.txHash.slice(0, 10)}...`,
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

    if (!rawProvider) {
      throw new Error('Connected Super Author wallet is required to sign the review transaction.');
    }

    if (!isContractConfigured(selectedNetwork)) {
      if (selectedNetwork === 'mainnet') {
        throw new Error(
          'MAINNET CONTRACT NOT DEPLOYED/CONFIGURED: Smart contract has not been deployed to MST Chain Mainnet (Chain ID 4646). Application review cannot proceed.'
        );
      }
      throw new Error(`Smart contract is not configured on ${MST_NETWORKS[selectedNetwork].name}.`);
    }

    if (walletChainId && !isChainIdMatchingNetwork(walletChainId, selectedNetwork)) {
      throw new Error(
        `Wallet network mismatch. Connected to chain ID ${walletChainId}, but selected network is ${MST_NETWORKS[selectedNetwork].name} (${MST_NETWORKS[selectedNetwork].chainIdDecimal}). Please switch networks in your wallet before submitting.`
      );
    }

    const cleanQuery = appId.trim().toLowerCase();
    const targetApp = applications.find(
      a => a.id.toLowerCase() === cleanQuery || a.applicantWallet.toLowerCase() === cleanQuery
    );
    if (!targetApp) {
      throw new Error(`Application ${appId} not found.`);
    }

    // Call reviewAuthorApplicationOnChain on the active deployed contract
    const chainRes = await reviewAuthorApplicationOnChain(
      targetApp.applicantWallet,
      decision === 'Approved',
      notes || '',
      rawProvider,
      selectedNetwork
    );

    if (!chainRes.success || !chainRes.txHash) {
      throw new Error(chainRes.error || 'On-chain review transaction was rejected or failed.');
    }

    const approvalTxHash = chainRes.txHash;
    const approvalBlockNumber = chainRes.blockNumber;

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
        saveAuthorizedAuthors(updated, selectedNetwork);
        return updated;
      });

      // Update role cache in wallet context
      refreshAuthorRoles();
    }

    // Update application record
    setApplications(prev => {
      const updated = prev.map(a => {
        if (a.id.toLowerCase() === targetApp.id.toLowerCase() || a.applicantWallet.toLowerCase() === targetApp.applicantWallet.toLowerCase()) {
          return {
            ...a,
            status: decision as ApplicationStatus,
            reviewedAt: new Date().toISOString(),
            reviewedBy: address || 'Super Author',
            reviewNotes: notes?.trim() || undefined,
            approvalTxHash,
            approvalBlockNumber,
            isOnChain: true,
          };
        }
        return a;
      });
      saveAuthorApplications(updated, selectedNetwork);
      return updated;
    });

    addToast(
      `Application ${decision} On-Chain`,
      `Application ${targetApp.id} for ${targetApp.applicantName} marked as ${decision} on ${selectedNetwork}. Tx: ${approvalTxHash.slice(0, 10)}...`,
      decision === 'Approved' ? 'success' : 'warning'
    );

    // Sync from blockchain to ensure on-chain state is up to date
    syncOnChainApplications(selectedNetwork);

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

    if (!isContractConfigured(selectedNetwork)) {
      if (selectedNetwork === 'mainnet') {
        throw new Error(
          'MAINNET CONTRACT NOT DEPLOYED/CONFIGURED: Smart contract has not been deployed to MST Chain Mainnet (Chain ID 4646). Deauthorization cannot proceed.'
        );
      }
      throw new Error(`Smart contract is not configured on ${MST_NETWORKS[selectedNetwork].name}.`);
    }

    if (walletChainId && !isChainIdMatchingNetwork(walletChainId, selectedNetwork)) {
      throw new Error(
        `Wallet network mismatch. Connected to chain ID ${walletChainId}, but selected network is ${MST_NETWORKS[selectedNetwork].name} (${MST_NETWORKS[selectedNetwork].chainIdDecimal}). Please switch networks in your wallet before submitting.`
      );
    }

    const clean = walletAddress.trim().toLowerCase();
    const existing = authorizedAuthors.find(a => a.walletAddress.toLowerCase() === clean);
    if (!existing) {
      throw new Error('Author not found.');
    }

    if (rawProvider) {
      const chainRes = await deauthorizeAuthorOnChain(walletAddress, rawProvider, selectedNetwork);
      if (!chainRes.success || !chainRes.txHash) {
        throw new Error(chainRes.error || 'On-chain deauthorization failed.');
      }
      addToast(
        'On-Chain Deauthorization Confirmed',
        `Revoked on ${selectedNetwork}. Tx: ${chainRes.txHash.slice(0, 10)}...`,
        'info'
      );
    }

    setAuthorizedAuthors(prev => {
      const updated = prev.map(a => {
        if (a.walletAddress.toLowerCase() === clean) {
          return {
            ...a,
            isActive: false,
          };
        }
        return a;
      });
      saveAuthorizedAuthors(updated, selectedNetwork);
      return updated;
    });

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
        isSyncingOnChain,
        syncError,
        syncOnChainApplications,
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
