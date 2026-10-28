import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { 
  DocumentRecord, 
  SharedRecord, 
  ActivityEvent, 
  VerificationCheckResult,
  DocumentType 
} from '../types';
import { 
  loadDocuments, 
  saveDocuments, 
  loadSharedRecords, 
  saveSharedRecords, 
  loadActivities, 
  saveActivities, 
  resetDemoData as resetStorage 
} from '../lib/storage';
import { generateDocumentId, generateUUID } from '../lib/id';
import { computeFileSHA256 } from '../lib/hash';
import { 
  registerOnChain, 
  verifyOnChain, 
  revokeOnChain, 
  isContractConfigured,
  getOnChainDetails,
  getOnChainIdByHash,
  MST_NETWORKS,
  type MSTNetworkKey
} from '../services/contractService';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
}

interface RegisterParams {
  name: string;
  type: DocumentType;
  description: string;
  owner: string;
  issueDate: string;
  expiryDate?: string;
  file: File;
  rawProvider?: any;
  networkKey?: MSTNetworkKey;
}

interface ShareParams {
  documentId: string;
  recipient: string;
  durationLabel: string;
  durationDays: number;
}

interface DocumentContextType {
  documents: DocumentRecord[];
  sharedRecords: SharedRecord[];
  activities: ActivityEvent[];
  toasts: ToastMessage[];
  addToast: (title: string, message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  removeToast: (id: string) => void;
  registerDocument: (params: RegisterParams) => Promise<DocumentRecord>;
  registerExistingDocumentOnChain: (docId: string, rawProvider: any, networkKey?: MSTNetworkKey) => Promise<boolean>;
  revokeDocumentOnChain: (docId: string, reason: string, rawProvider: any, networkKey?: MSTNetworkKey) => Promise<boolean>;
  verifyDocument: (queryId?: string, file?: File, networkKey?: MSTNetworkKey) => Promise<VerificationCheckResult>;
  shareDocument: (params: ShareParams) => Promise<SharedRecord>;
  revokeSharing: (sharedId: string) => void;
  updateDocument: (id: string, updates: Partial<DocumentRecord>) => void;
  resetAllDemoData: () => void;
  getDocumentById: (id: string) => DocumentRecord | undefined;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export const DocumentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [sharedRecords, setSharedRecords] = useState<SharedRecord[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    setDocuments(loadDocuments());
    setSharedRecords(loadSharedRecords());
    setActivities(loadActivities());
  }, []);

  const addToast = (title: string, message: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    const id = generateUUID();
    const newToast: ToastMessage = { id, title, message, type };
    setToasts(prev => [...prev, newToast]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const getDocumentById = (id: string): DocumentRecord | undefined => {
    if (!id) return undefined;
    const cleanId = id.trim().toUpperCase();
    return documents.find(d => d.id.toUpperCase() === cleanId);
  };

  const registerDocument = async (params: RegisterParams): Promise<DocumentRecord> => {
    // Real browser SHA-256 calculation
    const sha256Hash = await computeFileSHA256(params.file);
    const newId = generateDocumentId();
    const nowIso = new Date().toISOString();
    const targetNet: MSTNetworkKey = params.networkKey || 'testnet';
    const targetNetName = MST_NETWORKS[targetNet]?.name || 'MST Chain';

    let txHash: string | undefined = undefined;
    let blockNumber: number | undefined = undefined;
    let contractAddress: string | undefined = undefined;
    let networkChainId: string | undefined = undefined;
    let registrantAddress: string | undefined = undefined;
    let onChainStatus: 'unregistered' | 'registered' | 'revoked' = 'unregistered';

    // On-Chain MST Chain registration when wallet provider is provided
    if (params.rawProvider) {
      if (isContractConfigured(targetNet)) {
        const onChainResult = await registerOnChain(newId, sha256Hash, params.type, params.rawProvider, targetNet);
        if (onChainResult.success) {
          txHash = onChainResult.txHash;
          blockNumber = onChainResult.blockNumber;
          contractAddress = onChainResult.contractAddress;
          networkChainId = onChainResult.networkChainId;
          registrantAddress = onChainResult.registrant;
          onChainStatus = 'registered';
          addToast(`Registered On ${targetNetName}`, `Confirmed in block #${blockNumber}. Tx: ${txHash?.slice(0, 10)}...`);
        } else {
          addToast('Blockchain Anchoring Warning', onChainResult.error || 'Failed to record on-chain. Saved locally.', 'warning');
        }
      } else {
        addToast(
          'Smart Contract Unconfigured',
          `Contract not yet deployed to ${targetNetName}. Saved to local catalog.`,
          'info'
        );
      }
    }

    const newDoc: DocumentRecord = {
      id: newId,
      name: params.name,
      type: params.type,
      description: params.description,
      owner: params.owner,
      issueDate: params.issueDate,
      expiryDate: params.expiryDate,
      registeredAt: nowIso,
      status: 'Registered',
      sha256Hash,
      fileName: params.file.name,
      fileSizeBytes: params.file.size,
      qrPayloadUrl: `/verify/${newId}`,
      txHash,
      blockNumber,
      contractAddress,
      networkChainId,
      networkKey: targetNet,
      registrantAddress,
      onChainStatus,
    };

    const updatedDocs = [newDoc, ...documents];
    setDocuments(updatedDocs);
    saveDocuments(updatedDocs);

    const newActivity: ActivityEvent = {
      id: generateUUID(),
      type: 'Document Registered',
      title: onChainStatus === 'registered' ? 'Document Anchored On-Chain' : 'New Document Registered',
      description: onChainStatus === 'registered' 
        ? `Registered "${newDoc.name}" (${newDoc.id}) on ${targetNetName}. Tx: ${txHash?.slice(0, 12)}...`
        : `Registered "${newDoc.name}" with ID ${newDoc.id}. SHA-256 fingerprint computed locally.`,
      documentId: newDoc.id,
      timestamp: nowIso,
      status: 'success',
    };

    const updatedActivities = [newActivity, ...activities];
    setActivities(updatedActivities);
    saveActivities(updatedActivities);

    if (onChainStatus !== 'registered') {
      addToast('Document Registered', `Assigned ID ${newId}. Document is ready for verification.`);
    }
    return newDoc;
  };

  const verifyDocument = async (
    queryId?: string,
    file?: File,
    networkKey?: MSTNetworkKey
  ): Promise<VerificationCheckResult> => {
    const nowIso = new Date().toISOString();
    const networksToQuery: MSTNetworkKey[] = networkKey 
      ? [networkKey] 
      : (['testnet', 'mainnet'] as MSTNetworkKey[]).filter(k => isContractConfigured(k));

    // Fallback if none configured
    if (networksToQuery.length === 0) {
      networksToQuery.push(networkKey || 'testnet');
    }

    // Mode 1: Query by file
    if (file) {
      const computedHash = await computeFileSHA256(file);
      
      // If queryId also provided, check specific document
      if (queryId && queryId.trim()) {
        const cleanId = queryId.trim().toUpperCase();
        let found = documents.find(d => d.id.toUpperCase() === cleanId);
        let foundOnNet: MSTNetworkKey | undefined = found?.networkKey;
        
        // If not in local catalog, query on-chain registry directly
        if (!found) {
          for (const net of networksToQuery) {
            if (isContractConfigured(net)) {
              try {
                const onChainDetails = await getOnChainDetails(cleanId, net);
                if (onChainDetails.exists) {
                  foundOnNet = net;
                  found = {
                    id: cleanId,
                    name: `Document ${cleanId}`,
                    type: (onChainDetails.documentType as DocumentType) || 'Property Deed',
                    description: `Registered on ${MST_NETWORKS[net].name}.`,
                    owner: onChainDetails.registrant || 'On-Chain Registrant',
                    issueDate: new Date(onChainDetails.registeredAt * 1000).toISOString().slice(0, 10),
                    registeredAt: new Date(onChainDetails.registeredAt * 1000).toISOString(),
                    status: onChainDetails.isRevoked ? 'Hash Mismatch' : 'Registered',
                    sha256Hash: onChainDetails.documentHash,
                    fileName: 'on-chain-record',
                    fileSizeBytes: 0,
                    qrPayloadUrl: `/verify/${cleanId}`,
                    networkKey: net,
                    onChainStatus: onChainDetails.isRevoked ? 'revoked' : 'registered',
                    registrantAddress: onChainDetails.registrant,
                  };
                  break;
                }
              } catch {
                // on-chain read fallback
              }
            }
          }
        }

        if (!found) {
          const result: VerificationCheckResult = {
            state: 'not_found',
            submittedHash: computedHash,
            message: 'Document ID Not Found',
            details: `No document with ID "${queryId}" exists in local records or on MST Chain.`,
            timestamp: nowIso,
            networkKey: networkKey || 'testnet',
          };
          recordVerificationActivity('Document Not Found', `Lookup failed for ID ${queryId}.`, queryId, 'warning');
          return result;
        }

        if (found.sha256Hash.toLowerCase() === computedHash.toLowerCase()) {
          const isRevoked = found.onChainStatus === 'revoked';
          const result: VerificationCheckResult = {
            state: isRevoked ? 'mismatch' : found.status === 'Pending' ? 'pending' : 'verified',
            document: found,
            submittedHash: computedHash,
            storedHash: found.sha256Hash,
            message: isRevoked ? 'Document Revoked On-Chain' : found.status === 'Pending' ? 'Pending Review' : 'Verified Record',
            details: isRevoked
              ? 'Computed hash matches the registered baseline, but this document has been revoked on-chain.'
              : found.status === 'Pending' 
              ? 'Document record found and digital hash matches, but the registration is marked as Pending Review.'
              : 'Computed file SHA-256 matches the registered baseline digest perfectly.',
            timestamp: nowIso,
            onChainVerified: Boolean(found.onChainStatus === 'registered'),
            onChainRegistrant: found.registrantAddress,
            isRevokedOnChain: isRevoked,
            networkKey: foundOnNet || found.networkKey,
            txHash: found.txHash,
          };
          recordVerificationActivity(
            isRevoked ? 'Document Revoked Flagged' : found.status === 'Pending' ? 'Verification Pending' : 'Verification Confirmed', 
            `File matched hash for ${found.id}.`, 
            found.id, 
            isRevoked ? 'error' : found.status === 'Pending' ? 'warning' : 'success'
          );
          return result;
        } else {
          const result: VerificationCheckResult = {
            state: 'mismatch',
            document: found,
            submittedHash: computedHash,
            storedHash: found.sha256Hash,
            message: 'Hash Mismatch Detected',
            details: 'The submitted file digest does not match the registered baseline hash. The file may have been modified or altered.',
            timestamp: nowIso,
            networkKey: foundOnNet || found.networkKey,
          };
          recordVerificationActivity('Hash Mismatch Flagged', `Submitted file hash differed from baseline for ${found.id}.`, found.id, 'error');
          return result;
        }
      }

      // Query by file hash alone
      let matchByHash = documents.find(d => d.sha256Hash.toLowerCase() === computedHash.toLowerCase());
      let matchedNet: MSTNetworkKey | undefined = matchByHash?.networkKey;

      // If not in local catalog, query on-chain reverse lookup across configured networks
      if (!matchByHash) {
        for (const net of networksToQuery) {
          if (isContractConfigured(net)) {
            try {
              const onChainId = await getOnChainIdByHash(computedHash, net);
              if (onChainId) {
                const onChainDetails = await getOnChainDetails(onChainId, net);
                if (onChainDetails.exists) {
                  matchedNet = net;
                  matchByHash = {
                    id: onChainId,
                    name: `Document ${onChainId}`,
                    type: (onChainDetails.documentType as DocumentType) || 'Property Deed',
                    description: `Registered on ${MST_NETWORKS[net].name}.`,
                    owner: onChainDetails.registrant || 'On-Chain Registrant',
                    issueDate: new Date(onChainDetails.registeredAt * 1000).toISOString().slice(0, 10),
                    registeredAt: new Date(onChainDetails.registeredAt * 1000).toISOString(),
                    status: onChainDetails.isRevoked ? 'Hash Mismatch' : 'Registered',
                    sha256Hash: onChainDetails.documentHash,
                    fileName: 'on-chain-record',
                    fileSizeBytes: 0,
                    qrPayloadUrl: `/verify/${onChainId}`,
                    networkKey: net,
                    onChainStatus: onChainDetails.isRevoked ? 'revoked' : 'registered',
                    registrantAddress: onChainDetails.registrant,
                  };
                  break;
                }
              }
            } catch {
              // reverse lookup fallback
            }
          }
        }
      }

      if (matchByHash) {
        const isRevoked = matchByHash.onChainStatus === 'revoked';
        const result: VerificationCheckResult = {
          state: isRevoked ? 'mismatch' : matchByHash.status === 'Pending' ? 'pending' : 'verified',
          document: matchByHash,
          submittedHash: computedHash,
          storedHash: matchByHash.sha256Hash,
          message: isRevoked ? 'Document Revoked On-Chain' : matchByHash.status === 'Pending' ? 'Pending Review' : 'Verified Record',
          details: isRevoked
            ? `Identified registered document "${matchByHash.name}" (${matchByHash.id}), but record is revoked on-chain.`
            : `Identified corresponding registered document "${matchByHash.name}" (${matchByHash.id}). Hash matched exactly.`,
          timestamp: nowIso,
          onChainVerified: Boolean(matchByHash.onChainStatus === 'registered'),
          onChainRegistrant: matchByHash.registrantAddress,
          isRevokedOnChain: isRevoked,
          networkKey: matchedNet || matchByHash.networkKey,
          txHash: matchByHash.txHash,
        };
        recordVerificationActivity('Verification Confirmed', `File digest matched registered document ${matchByHash.id}.`, matchByHash.id, isRevoked ? 'error' : 'success');
        return result;
      } else {
        const result: VerificationCheckResult = {
          state: 'not_found',
          submittedHash: computedHash,
          message: 'Document Not Found in Registry',
          details: 'The calculated SHA-256 hash does not match any registered document in the local repository or active MST Chain registry.',
          timestamp: nowIso,
          networkKey: networkKey || 'testnet',
        };
        recordVerificationActivity('Verification Query', 'Submitted file hash did not match any stored record.', undefined, 'warning');
        return result;
      }
    }

    // Mode 2: Query by Document ID alone
    if (queryId && queryId.trim()) {
      const cleanId = queryId.trim().toUpperCase();
      let found = documents.find(d => d.id.toUpperCase() === cleanId);
      let foundNet: MSTNetworkKey | undefined = found?.networkKey;

      // If not in local catalog, query on-chain smart contract
      if (!found) {
        for (const net of networksToQuery) {
          if (isContractConfigured(net)) {
            try {
              const onChain = await verifyOnChain(cleanId, undefined, net);
              if (onChain.checked && onChain.exists) {
                foundNet = net;
                found = {
                  id: cleanId,
                  name: `Document ${cleanId}`,
                  type: (onChain.documentType as DocumentType) || 'Property Deed',
                  description: `Registered on ${MST_NETWORKS[net].name}.`,
                  owner: onChain.registrant || 'On-Chain Registrant',
                  issueDate: new Date(Number(onChain.registeredAt || 0) * 1000).toISOString().slice(0, 10),
                  registeredAt: new Date(Number(onChain.registeredAt || 0) * 1000).toISOString(),
                  status: onChain.isRevoked ? 'Hash Mismatch' : 'Registered',
                  sha256Hash: onChain.documentHash || '',
                  fileName: 'on-chain-record',
                  fileSizeBytes: 0,
                  qrPayloadUrl: `/verify/${cleanId}`,
                  networkKey: net,
                  contractAddress: onChain.contractAddress,
                  onChainStatus: onChain.isRevoked ? 'revoked' : 'registered',
                  registrantAddress: onChain.registrant,
                };
                break;
              }
            } catch {
              // on-chain fallback
            }
          }
        }
      }

      if (!found) {
        const result: VerificationCheckResult = {
          state: 'not_found',
          message: 'Document ID Not Found',
          details: `The identifier "${queryId}" does not exist in the NotaryVault catalog or active MST Chain network.`,
          timestamp: nowIso,
          networkKey: networkKey || 'testnet',
        };
        recordVerificationActivity('Document Not Found', `No record for ID ${queryId}.`, queryId, 'warning');
        return result;
      }

      if (found.status === 'Hash Mismatch' || found.onChainStatus === 'revoked') {
        const result: VerificationCheckResult = {
          state: 'mismatch',
          document: found,
          storedHash: found.sha256Hash,
          message: found.onChainStatus === 'revoked' ? 'Document Revoked On-Chain' : 'Hash Mismatch on Record',
          details: found.onChainStatus === 'revoked'
            ? 'This document record is revoked on-chain and is no longer certified.'
            : 'Integrity mismatch was logged for this document ID.',
          timestamp: nowIso,
          onChainVerified: Boolean(found.onChainStatus === 'registered'),
          onChainRegistrant: found.registrantAddress,
          isRevokedOnChain: found.onChainStatus === 'revoked',
          networkKey: foundNet || found.networkKey,
          txHash: found.txHash,
        };
        recordVerificationActivity('Revoked Status Retrieved', `Inspection flagged ${found.id} as revoked or mismatched.`, found.id, 'error');
        return result;
      }

      const result: VerificationCheckResult = {
        state: found.status === 'Pending' ? 'pending' : 'verified',
        document: found,
        storedHash: found.sha256Hash,
        message: found.status === 'Pending' ? 'Pending Review' : 'Active Document Found',
        details: found.status === 'Pending'
          ? 'Record exists in NotaryVault, but verification status is pending review.'
          : 'Document ID located. Submit the digital file to confirm SHA-256 integrity match.',
        timestamp: nowIso,
        onChainVerified: Boolean(found.onChainStatus === 'registered'),
        onChainRegistrant: found.registrantAddress,
        isRevokedOnChain: false,
        networkKey: foundNet || found.networkKey,
        txHash: found.txHash,
      };
      recordVerificationActivity('Document Record Located', `Retrieved ${found.id} for inspection.`, found.id, 'info');
      return result;
    }

    const emptyResult: VerificationCheckResult = {
      state: 'not_found',
      message: 'Invalid Verification Request',
      details: 'Please provide either a Document ID or upload a file to verify.',
      timestamp: nowIso,
      networkKey: networkKey || 'testnet',
    };
    return emptyResult;
  };

  const recordVerificationActivity = (
    title: string, 
    description: string, 
    documentId?: string, 
    status: 'success' | 'warning' | 'error' | 'info' = 'info'
  ) => {
    const newAct: ActivityEvent = {
      id: generateUUID(),
      type: 'Verification Requested',
      title,
      description,
      documentId,
      timestamp: new Date().toISOString(),
      status,
    };
    setActivities(prev => {
      const updated = [newAct, ...prev];
      saveActivities(updated);
      return updated;
    });
  };

  const shareDocument = async (params: ShareParams): Promise<SharedRecord> => {
    const doc = getDocumentById(params.documentId);
    if (!doc) {
      throw new Error(`Document ${params.documentId} not found.`);
    }

    const now = new Date();
    const expiresDate = new Date(now.getTime() + params.durationDays * 24 * 60 * 60 * 1000);

    const newShared: SharedRecord = {
      id: generateUUID(),
      documentId: doc.id,
      documentName: doc.name,
      recipient: params.recipient,
      sharedAt: now.toISOString(),
      expiresAt: expiresDate.toISOString(),
      status: 'Active',
      accessCount: 0,
    };

    const updatedShared = [newShared, ...sharedRecords];
    setSharedRecords(updatedShared);
    saveSharedRecords(updatedShared);

    const newActivity: ActivityEvent = {
      id: generateUUID(),
      type: 'Document Shared',
      title: 'Shared Document Access',
      description: `Granted ${params.durationLabel} access to ${params.recipient} for document ${doc.id}.`,
      documentId: doc.id,
      timestamp: now.toISOString(),
      status: 'info',
    };
    const updatedActs = [newActivity, ...activities];
    setActivities(updatedActs);
    saveActivities(updatedActs);

    addToast('Share Link Created', `Share reference generated for ${params.recipient}.`);
    return newShared;
  };

  const revokeSharing = (sharedId: string) => {
    const item = sharedRecords.find(s => s.id === sharedId);
    if (!item) return;

    const updated = sharedRecords.map(s => 
      s.id === sharedId ? { ...s, status: 'Revoked' as const } : s
    );
    setSharedRecords(updated);
    saveSharedRecords(updated);

    const newAct: ActivityEvent = {
      id: generateUUID(),
      type: 'Access Revoked',
      title: 'Access Revoked',
      description: `Revoked access for recipient ${item.recipient} on document ${item.documentId}.`,
      documentId: item.documentId,
      timestamp: new Date().toISOString(),
      status: 'warning',
    };
    const updatedActs = [newAct, ...activities];
    setActivities(updatedActs);
    saveActivities(updatedActs);

    addToast('Access Revoked', `External access permissions for ${item.recipient} have been revoked.`, 'warning');
  };

  const updateDocument = (id: string, updates: Partial<DocumentRecord>) => {
    const updated = documents.map(d => d.id === id ? { ...d, ...updates } : d);
    setDocuments(updated);
    saveDocuments(updated);

    const newAct: ActivityEvent = {
      id: generateUUID(),
      type: 'Document Details Updated',
      title: 'Document Details Updated',
      description: `Updated metadata attributes for ${id}.`,
      documentId: id,
      timestamp: new Date().toISOString(),
      status: 'info',
    };
    const updatedActs = [newAct, ...activities];
    setActivities(updatedActs);
    saveActivities(updatedActs);

    addToast('Document Updated', `Changes to ${id} have been saved.`);
  };

  const registerExistingDocumentOnChain = async (
    docId: string, 
    rawProvider: any,
    networkKey?: MSTNetworkKey
  ): Promise<boolean> => {
    const doc = getDocumentById(docId);
    if (!doc) {
      addToast('Error', `Document ${docId} not found in catalog.`, 'error');
      return false;
    }

    const targetNet: MSTNetworkKey = networkKey || doc.networkKey || 'testnet';
    const netDef = MST_NETWORKS[targetNet];

    if (!isContractConfigured(targetNet)) {
      const deployCmd = targetNet === 'mainnet' ? 'npm run deploy:mst:mainnet' : 'npm run deploy:mst';
      addToast('Contract Not Deployed', `Please deploy NotaryVaultRegistry to ${netDef.name} using \`${deployCmd}\`.`, 'error');
      return false;
    }

    const result = await registerOnChain(doc.id, doc.sha256Hash, doc.type, rawProvider, targetNet);
    if (result.success) {
      const updates: Partial<DocumentRecord> = {
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        contractAddress: result.contractAddress,
        networkChainId: result.networkChainId,
        networkKey: targetNet,
        registrantAddress: result.registrant,
        onChainStatus: 'registered',
      };
      updateDocument(doc.id, updates);
      addToast('Anchored On-Chain', `Successfully registered ${doc.id} on ${netDef.name}! Block #${result.blockNumber}`, 'success');
      return true;
    } else {
      addToast('Registration Failed', result.error || 'Failed to submit transaction.', 'error');
      return false;
    }
  };

  const revokeDocumentOnChain = async (
    docId: string, 
    reason: string, 
    rawProvider: any,
    networkKey?: MSTNetworkKey
  ): Promise<boolean> => {
    const doc = getDocumentById(docId);
    if (!doc) {
      addToast('Error', `Document ${docId} not found.`, 'error');
      return false;
    }

    const targetNet: MSTNetworkKey = networkKey || doc.networkKey || 'testnet';
    const netDef = MST_NETWORKS[targetNet];

    if (!isContractConfigured(targetNet)) {
      addToast('Contract Not Deployed', `Smart contract is not configured on ${netDef.name}.`, 'error');
      return false;
    }

    const result = await revokeOnChain(doc.id, reason, rawProvider, targetNet);
    if (result.success) {
      updateDocument(doc.id, { onChainStatus: 'revoked', networkKey: targetNet });
      addToast('Document Revoked', `Document ${doc.id} marked as revoked on ${netDef.name}.`, 'warning');
      return true;
    } else {
      addToast('Revocation Failed', result.error || 'Failed to revoke document.', 'error');
      return false;
    }
  };

  const resetAllDemoData = () => {
    resetStorage();
    setDocuments([]);
    setSharedRecords([]);
    setActivities([]);
    addToast('Repository Reset', 'Local repository cleared to initial state.', 'info');
  };

  return (
    <DocumentContext.Provider
      value={{
        documents,
        sharedRecords,
        activities,
        toasts,
        addToast,
        removeToast,
        registerDocument,
        registerExistingDocumentOnChain,
        revokeDocumentOnChain,
        verifyDocument,
        shareDocument,
        revokeSharing,
        updateDocument,
        resetAllDemoData,
        getDocumentById,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
};

export const useDocuments = (): DocumentContextType => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useDocuments must be used within a DocumentProvider');
  }
  return context;
};
