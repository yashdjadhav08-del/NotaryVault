import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  mergeDocuments,
  mergeActivities,
  resetDemoData as resetStorage 
} from '../lib/storage';
import { useWallet } from './WalletContext';
import { 
  generateUniqueDocumentId, 
  generateUUID, 
  normalizeDocumentId, 
  isValidDocumentId 
} from '../lib/id';
import { computeFileSHA256, areSha256HashesEqual } from '../lib/hash';
import { validatePdfFile } from '../lib/pdfValidator';
import { 
  saveLocalPDF, 
  clearAllLocalPDFs, 
  uploadPdfToServer, 
  verifyServerStorage, 
  confirmServerRegistration 
} from '../lib/pdfStorage';
import { 
  registerOnChain, 
  verifyOnChain, 
  revokeOnChain, 
  isContractConfigured, 
  getOnChainDetails, 
  getOnChainIdByHash, 
  checkDocumentIdExists,
  recoverOnChainRecords,
  isChainIdMatchingNetwork,
  MST_NETWORKS, 
  type MSTNetworkKey 
} from '../services/contractService';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
}

export interface RegisterParams {
  customId?: string;
  name: string;
  type: DocumentType;
  description: string;
  owner: string;
  walletAddress?: string;
  issueDate: string;
  expiryDate?: string;
  propertyId?: string;
  file: File;
  rawProvider?: any;
  networkKey?: MSTNetworkKey;
  ownerEmail?: string;
  ownerMobile?: string;
  notificationConsent?: boolean;
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
  isSyncing: boolean;
  syncError: string | null;
  syncWithBlockchain: (networkKey?: MSTNetworkKey, force?: boolean) => Promise<{ recoveredCount: number; error?: string }>;
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
  getDocumentsByPropertyId: (propertyId: string) => DocumentRecord[];
  checkPropertyConflicts: (propertyId: string, currentOwner: string) => { hasConflict: boolean; existingDocs: DocumentRecord[]; note?: string };
  checkDocumentIdAvailability: (id: string, networkKey?: MSTNetworkKey) => Promise<{ available: boolean; source?: string; reason?: string; warning?: string }>;
  generateAvailableDocumentId: (networkKey?: MSTNetworkKey) => Promise<string>;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export const DocumentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  let isSuperAuthor = false;
  let callerAddress: string | null = null;
  let selectedNetwork: MSTNetworkKey = 'testnet';
  let walletChainId: string | null = null;

  try {
    const wallet = useWallet();
    isSuperAuthor = Boolean(wallet?.isSuperAuthor);
    callerAddress = wallet?.address || null;
    selectedNetwork = wallet?.selectedNetwork || 'testnet';
    walletChainId = wallet?.chainId || null;
  } catch {
    isSuperAuthor = false;
    callerAddress = null;
    selectedNetwork = 'testnet';
    walletChainId = null;
  }

  // Synchronous initialization from localStorage partitioned by active network
  const [documents, setDocuments] = useState<DocumentRecord[]>(() => loadDocuments(selectedNetwork));
  const [sharedRecords, setSharedRecords] = useState<SharedRecord[]>(() => loadSharedRecords(selectedNetwork));
  const [activities, setActivities] = useState<ActivityEvent[]>(() => loadActivities(selectedNetwork));
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);

  // React to network changes: switch local catalogs and trigger on-chain sync
  useEffect(() => {
    isMountedRef.current = true;
    setDocuments(loadDocuments(selectedNetwork));
    setSharedRecords(loadSharedRecords(selectedNetwork));
    setActivities(loadActivities(selectedNetwork));

    if (isContractConfigured(selectedNetwork)) {
      syncWithBlockchain(selectedNetwork);
    } else {
      setIsSyncing(false);
      setSyncError(null);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [selectedNetwork]);

  /**
   * Recovers and synchronizes on-chain registration records and event logs
   * into the local application catalog.
   */
  const syncWithBlockchain = async (
    networkKey: MSTNetworkKey = selectedNetwork,
    force: boolean = false
  ): Promise<{ recoveredCount: number; error?: string }> => {
    if (isSyncing && !force) {
      return { recoveredCount: 0 };
    }

    if (!isContractConfigured(networkKey)) {
      setIsSyncing(false);
      setSyncError(null);
      return { recoveredCount: 0 };
    }

    setIsSyncing(true);
    setSyncError(null);

    try {
      const recovered = await recoverOnChainRecords(networkKey);

      if (recovered.error) {
        if (isMountedRef.current) {
          setSyncError(recovered.error);
        }
        return { recoveredCount: 0, error: recovered.error };
      }

      let restoredCount = 0;

      if (recovered.documents.length > 0 || recovered.activities.length > 0) {
        setDocuments(prev => {
          const existingIds = new Set(prev.map(d => d.id.toUpperCase()));
          const merged = mergeDocuments(prev, recovered.documents);
          restoredCount = merged.filter(d => !existingIds.has(d.id.toUpperCase())).length;
          saveDocuments(merged, networkKey);
          return merged;
        });

        setActivities(prev => {
          const merged = mergeActivities(prev, recovered.activities);
          saveActivities(merged, networkKey);
          return merged;
        });

        if (restoredCount > 0) {
          addToast(
            'On-Chain Records Restored',
            `Restored ${restoredCount} document(s) and historical activity from ${MST_NETWORKS[networkKey].name}.`,
            'info'
          );
        }
      }

      return { recoveredCount: restoredCount };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to sync records from MST Chain.';
      if (isMountedRef.current) {
        setSyncError(errorMsg);
      }
      return { recoveredCount: 0, error: errorMsg };
    } finally {
      if (isMountedRef.current) {
        setIsSyncing(false);
      }
    }
  };

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
    const cleanId = normalizeDocumentId(id);
    return documents.find(d => normalizeDocumentId(d.id) === cleanId);
  };

  /**
   * Preflight check to verify whether a Document ID is available across local catalog,
   * active contract, and historical contract deployments.
   */
  const checkDocumentIdAvailability = async (
    id: string,
    networkKey?: MSTNetworkKey
  ): Promise<{ available: boolean; source?: string; reason?: string; warning?: string }> => {
    const cleanId = normalizeDocumentId(id);
    if (!cleanId) {
      return { available: false, source: 'invalid_format', reason: 'Document ID cannot be empty.' };
    }
    const val = isValidDocumentId(cleanId);
    if (!val.valid) {
      return { available: false, source: 'invalid_format', reason: val.error };
    }

    // 1. Check local catalog
    const localMatch = documents.find(d => normalizeDocumentId(d.id) === cleanId);
    if (localMatch) {
      return {
        available: false,
        source: 'local_catalog',
        reason: 'Document ID exists in the local catalog.',
      };
    }

    // 2. Check on-chain (active contract + historical deployments)
    const targetNet: MSTNetworkKey = networkKey || 'testnet';

    // Fast-path: When smart contract is not deployed (e.g. Mainnet prior to deployment)
    // Requirement 8: Clearly show that on-chain uniqueness verification is unavailable
    if (!isContractConfigured(targetNet)) {
      return {
        available: true,
        source: 'contract_unconfigured',
        warning: targetNet === 'mainnet'
          ? 'On-chain uniqueness verification is unavailable (Mainnet smart contract is not yet deployed).'
          : `On-chain uniqueness verification is unavailable (${targetNet} contract not configured).`,
      };
    }

    try {
      const onChain = await checkDocumentIdExists(cleanId, targetNet);
      if (onChain.exists) {
        const conflictMsg = onChain.source === 'historical_contract'
          ? 'Document ID exists in the historical registry.'
          : 'Document ID already exists on the active registry.';
        return {
          available: false,
          source: onChain.source || 'active_contract',
          reason: conflictMsg,
        };
      }
      
      // Requirement 7: Do not claim an ID is unique if any required registry check fails
      if (onChain.error) {
        return {
          available: false,
          source: 'rpc_error',
          reason: 'Could not verify Document ID uniqueness on-chain due to an RPC error. Please retry.',
          warning: 'Could not verify Document ID because the RPC request failed. Please retry.',
        };
      }
    } catch {
      // Requirement 7: Do not claim an ID is unique if any required registry check fails
      return {
        available: false,
        source: 'rpc_error',
        reason: 'Could not verify Document ID uniqueness because the RPC request failed. Please retry.',
        warning: 'Could not verify Document ID because the RPC request failed. Please retry.',
      };
    }

    return { available: true };
  };

  /**
   * Generates a collision-resistant unique Document ID verified against local state and on-chain records.
   */
  const generateAvailableDocumentId = async (networkKey?: MSTNetworkKey): Promise<string> => {
    const targetNet: MSTNetworkKey = networkKey || 'testnet';

    // Fast-path: If smart contract is not deployed, immediately generate unique ID against local catalog
    if (!isContractConfigured(targetNet)) {
      return await generateUniqueDocumentId(async (cand) => {
        const norm = normalizeDocumentId(cand);
        return documents.some(d => normalizeDocumentId(d.id) === norm);
      });
    }

    return await generateUniqueDocumentId(async (cand) => {
      const norm = normalizeDocumentId(cand);
      // Local catalog check — authoritative
      if (documents.some(d => normalizeDocumentId(d.id) === norm)) return true;
      // On-chain check
      try {
        const res = await checkDocumentIdExists(norm, targetNet);
        if (res.exists) return true;
        return false;
      } catch {
        return false;
      }
    });
  };

  const registerDocument = async (params: RegisterParams): Promise<DocumentRecord> => {
    const targetNet: MSTNetworkKey = params.networkKey || 'testnet';
    const targetNetName = MST_NETWORKS[targetNet]?.name || 'MST Chain';

    // 1. Strict PDF Validation (validates non-empty, <= 50 MB limit, and %PDF- magic bytes)
    const pdfValidation = await validatePdfFile(params.file, params.file.name);
    if (!pdfValidation.valid) {
      throw new Error(pdfValidation.error || 'Invalid PDF document.');
    }

    // 2. Real browser SHA-256 calculation on exact original PDF bytes
    const sha256Hash = await computeFileSHA256(params.file);

    // 3. Duplicate Hash Policy: Reject identical document file hash locally
    const localDuplicate = documents.find(d => areSha256HashesEqual(d.sha256Hash, sha256Hash));
    if (localDuplicate) {
      throw new Error(`Duplicate Hash: An identical document file is already registered under ID "${localDuplicate.id}". Duplicate document hashes are rejected to prevent replay and forgery.`);
    }

    // Check on-chain duplicate hash (active and historical contracts)
    const onChainDuplicateId = await getOnChainIdByHash(sha256Hash, targetNet);
    if (onChainDuplicateId) {
      throw new Error(`Duplicate Hash: This document's SHA-256 digest is already registered on-chain under Document ID "${onChainDuplicateId}". Duplicate document hashes are rejected to prevent replay and forgery.`);
    }

    // 3. Document ID Determination & Canonical Normalization
    let candidateId = params.customId ? normalizeDocumentId(params.customId) : '';
    if (candidateId) {
      const validCheck = isValidDocumentId(candidateId);
      if (!validCheck.valid) {
        throw new Error(validCheck.error || 'Invalid Document ID format.');
      }
    } else {
      candidateId = await generateAvailableDocumentId(targetNet);
    }

    // 4. Global Document ID Uniqueness Enforcement
    // Check local catalog
    const localIdDuplicate = documents.find(d => normalizeDocumentId(d.id) === candidateId);
    if (localIdDuplicate) {
      throw new Error('Document ID exists in the local catalog.');
    }

    // Preflight check across active v2 and historical v1 contract
    const onChainIdCheck = await checkDocumentIdExists(candidateId, targetNet);
    if (onChainIdCheck.exists) {
      const conflictMsg = onChainIdCheck.source === 'historical_contract'
        ? 'Document ID exists in the historical registry.'
        : 'Document ID already exists on the active registry.';
      throw new Error(conflictMsg);
    }
    // If preflight had an RPC error, log but proceed — the on-chain transaction enforces uniqueness atomically
    if (onChainIdCheck.error) {
      console.warn(`[registerDocument] Preflight ID check for "${candidateId}" encountered RPC error: ${onChainIdCheck.error}. Proceeding to on-chain registration for atomic enforcement.`);
    }

    const cleanPropId = params.propertyId ? params.propertyId.trim().toUpperCase() : undefined;
    let hasConflictWarning = false;
    let conflictNotes: string | undefined = undefined;

    if (cleanPropId) {
      const existingPropDocs = documents.filter(d => d.propertyId && d.propertyId.toUpperCase() === cleanPropId);
      if (existingPropDocs.length > 0) {
        // Detect potentially conflicting ownership claims
        const differingOwners = existingPropDocs.filter(
          d => d.owner.trim().toLowerCase() !== params.owner.trim().toLowerCase()
        );
        if (differingOwners.length > 0) {
          hasConflictWarning = true;
          conflictNotes = `Property ID ${cleanPropId} has prior registration with differing party ("${differingOwners[0].owner}"). Flagged for authorized registrar review.`;
        }
      }
    }

    const nowIso = new Date().toISOString();

    // 5. Reliable PDF Persistence to Private Backend Storage (Pre-Blockchain Verification)
    // Upload original PDF to private backend storage
    const resolvedWallet = (params.walletAddress && params.walletAddress.startsWith('0x'))
      ? params.walletAddress
      : (callerAddress && callerAddress.startsWith('0x') ? callerAddress : undefined);

    const uploadRes = await uploadPdfToServer(candidateId, params.file, {
      fileName: params.file.name,
      sha256Hash,
      fileSizeBytes: params.file.size,
      pageCount: pdfValidation.pageCount,
      ownerWallet: resolvedWallet,
      ownerName: params.owner,
      ownerEmail: params.ownerEmail,
      ownerMobile: params.ownerMobile,
      notificationConsent: params.notificationConsent,
    });

    if (!uploadRes.success) {
      if (uploadRes.isConflict) {
        throw new Error(uploadRes.error || `Conflict: Document ID "${candidateId}" is already registered with a different file.`);
      }
      throw new Error(
        `Storage Persistence Failed: Could not securely save original PDF in backend storage (${uploadRes.error || 'Server rejected file upload'}). Blockchain transaction was aborted to ensure original document availability.`
      );
    }

    // Verify server actually wrote the file to disk and verified matching SHA-256 hash
    const storageVerify = await verifyServerStorage(candidateId, sha256Hash);
    if (!storageVerify.verified) {
      throw new Error(
        `Storage Persistence Failed: Could not securely save and verify the original PDF in backend storage (${storageVerify.error || 'Disk verification failed'}). Blockchain transaction was aborted to ensure original document availability.`
      );
    }

    // Also persist to local client cache (IndexedDB / memory)
    await saveLocalPDF(candidateId, params.file, {
      fileName: params.file.name,
      sha256Hash,
      fileSizeBytes: params.file.size,
      pageCount: pdfValidation.pageCount,
      ownerEmail: params.ownerEmail,
      ownerMobile: params.ownerMobile,
      notificationConsent: params.notificationConsent,
    });

    let txHash: string | undefined = undefined;
    let blockNumber: number | undefined = undefined;
    let contractAddress: string | undefined = undefined;
    let networkChainId: string | undefined = undefined;
    let registrantAddress: string | undefined = undefined;
    let onChainStatus: 'unregistered' | 'registered' | 'revoked' = 'unregistered';

    // 6. On-Chain MST Chain registration only after verified storage
    if (params.rawProvider) {
      if (!isContractConfigured(targetNet)) {
        if (targetNet === 'mainnet') {
          throw new Error(
            'MAINNET CONTRACT NOT DEPLOYED/CONFIGURED: Smart contract has not been deployed or configured on MST Chain Mainnet (Chain ID: 4646 / 0x1226). On-chain registration on Mainnet cannot proceed.'
          );
        }
        throw new Error(`Smart contract is not configured on ${targetNetName}. Cannot proceed with on-chain registration.`);
      }

      if (walletChainId && !isChainIdMatchingNetwork(walletChainId, targetNet)) {
        throw new Error(
          `Wallet network mismatch. Connected to chain ID ${walletChainId}, but selected network is ${targetNetName} (${MST_NETWORKS[targetNet].chainIdDecimal} / ${MST_NETWORKS[targetNet].chainIdHex}). Please switch networks in your wallet before registering.`
        );
      }

      const onChainResult = await registerOnChain(candidateId, sha256Hash, params.type, params.rawProvider, targetNet);
      if (onChainResult.success) {
        txHash = onChainResult.txHash;
        blockNumber = onChainResult.blockNumber;
        contractAddress = onChainResult.contractAddress;
        networkChainId = onChainResult.networkChainId;
        registrantAddress = onChainResult.registrant;
        onChainStatus = 'registered';

        // Persist transaction hash, block number, network, contract address in server database
        if (txHash) {
          await confirmServerRegistration(candidateId, {
            txHash,
            blockNumber,
            networkName: targetNetName,
            chainId: networkChainId,
            contractAddress,
            registrantAddress,
            ownerWallet: registrantAddress,
            title: params.name,
            category: params.type,
            issuer: params.owner,
            status: 'confirmed',
          });
        }

        addToast(`Registered On ${targetNetName}`, `Confirmed in block #${blockNumber}. Tx: ${txHash?.slice(0, 10)}...`);
      } else {
        // Revert cleanly without saving local record or incrementing count
        throw new Error(onChainResult.error || 'Failed to record on-chain.');
      }
    }

    const newDoc: DocumentRecord = {
      id: candidateId,
      name: params.name,
      type: params.type,
      description: params.description,
      owner: params.owner,
      propertyId: cleanPropId,
      hasConflictWarning,
      conflictNotes,
      issueDate: params.issueDate,
      expiryDate: params.expiryDate,
      registeredAt: nowIso,
      status: 'Registered',
      sha256Hash,
      fileName: params.file.name,
      fileSizeBytes: params.file.size,
      pageCount: pdfValidation.pageCount,
      qrPayloadUrl: `/verify/${candidateId}`,
      txHash,
      blockNumber,
      contractAddress,
      networkChainId,
      networkKey: targetNet,
      networkName: targetNetName,
      registrantAddress,
      onChainStatus,
    };

    setDocuments(prev => {
      const merged = mergeDocuments(prev, [newDoc]);
      saveDocuments(merged, targetNet);
      return merged;
    });

    const newActivity: ActivityEvent = {
      id: txHash ? `act_${txHash}_reg` : generateUUID(),
      type: 'Document Registered',
      title: onChainStatus === 'registered' ? 'Document Anchored On-Chain' : 'New Document Registered',
      description: onChainStatus === 'registered' 
        ? `Registered "${newDoc.name}" (${newDoc.id}) on ${targetNetName}. Tx: ${txHash?.slice(0, 12)}...`
        : `Registered "${newDoc.name}" with ID ${newDoc.id}. SHA-256 fingerprint verified in storage.`,
      documentId: newDoc.id,
      timestamp: nowIso,
      status: 'success',
      txHash,
      blockNumber,
      networkKey: targetNet,
      networkName: targetNetName,
      chainId: networkChainId,
      contractAddress,
      isOnChain: onChainStatus === 'registered',
    };

    setActivities(prev => {
      const merged = mergeActivities(prev, [newActivity]);
      saveActivities(merged, targetNet);
      return merged;
    });

    if (onChainStatus !== 'registered') {
      addToast('Document Registered', `Assigned ID ${candidateId}. Document is ready for verification.`);
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

        if (areSha256HashesEqual(found.sha256Hash, computedHash)) {
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
      let matchByHash = documents.find(d => areSha256HashesEqual(d.sha256Hash, computedHash));
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

    const docNet = doc.networkKey || selectedNetwork;
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
      networkKey: docNet,
    };

    const updatedShared = [newShared, ...sharedRecords];
    setSharedRecords(updatedShared);
    saveSharedRecords(updatedShared, docNet);

    const newActivity: ActivityEvent = {
      id: generateUUID(),
      type: 'Document Shared',
      title: 'Shared Document Access',
      description: `Granted ${params.durationLabel} access to ${params.recipient} for document ${doc.id}.`,
      documentId: doc.id,
      timestamp: now.toISOString(),
      status: 'info',
      networkKey: docNet,
      networkName: MST_NETWORKS[docNet]?.name,
    };
    const updatedActs = [newActivity, ...activities];
    setActivities(updatedActs);
    saveActivities(updatedActs, docNet);

    addToast('Share Link Created', `Share reference generated for ${params.recipient}.`);
    return newShared;
  };

  const revokeSharing = (sharedId: string) => {
    const item = sharedRecords.find(s => s.id === sharedId);
    if (!item) return;

    const itemNet = item.networkKey || selectedNetwork;
    const updated = sharedRecords.map(s => 
      s.id === sharedId ? { ...s, status: 'Revoked' as const } : s
    );
    setSharedRecords(updated);
    saveSharedRecords(updated, itemNet);

    const newAct: ActivityEvent = {
      id: generateUUID(),
      type: 'Access Revoked',
      title: 'Access Revoked',
      description: `Revoked access for recipient ${item.recipient} on document ${item.documentId}.`,
      documentId: item.documentId,
      timestamp: new Date().toISOString(),
      status: 'warning',
      networkKey: itemNet,
      networkName: MST_NETWORKS[itemNet]?.name,
    };
    const updatedActs = [newAct, ...activities];
    setActivities(updatedActs);
    saveActivities(updatedActs, itemNet);

    addToast('Access Revoked', `External access permissions for ${item.recipient} have been revoked.`, 'warning');
  };

  const updateDocument = (id: string, updates: Partial<DocumentRecord>) => {
    const existing = documents.find(d => d.id === id);
    const net = updates.networkKey || existing?.networkKey || selectedNetwork;

    setDocuments(prev => {
      const updated = prev.map(d => d.id === id ? { ...d, ...updates } : d);
      saveDocuments(updated, net);
      return updated;
    });

    const newAct: ActivityEvent = {
      id: generateUUID(),
      type: 'Document Details Updated',
      title: 'Document Details Updated',
      description: `Updated metadata attributes for ${id}.`,
      documentId: id,
      timestamp: new Date().toISOString(),
      status: 'info',
      networkKey: net,
      networkName: MST_NETWORKS[net]?.name,
    };
    setActivities(prev => {
      const merged = mergeActivities(prev, [newAct]);
      saveActivities(merged, net);
      return merged;
    });

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

    const targetNet: MSTNetworkKey = networkKey || doc.networkKey || selectedNetwork || 'testnet';
    const netDef = MST_NETWORKS[targetNet];

    if (!isContractConfigured(targetNet)) {
      if (targetNet === 'mainnet') {
        addToast(
          'MAINNET CONTRACT NOT DEPLOYED/CONFIGURED',
          'Smart contract has not been deployed to MST Chain Mainnet (Chain ID 4646). On-chain registration cannot proceed.',
          'error'
        );
      } else {
        addToast('Contract Not Deployed', `Please deploy NotaryVaultRegistry to ${netDef.name} using \`npm run deploy:mst\`.`, 'error');
      }
      return false;
    }

    if (walletChainId && !isChainIdMatchingNetwork(walletChainId, targetNet)) {
      addToast(
        'Network Mismatch',
        `Please switch your wallet to ${netDef.name} (${netDef.chainIdDecimal}) before submitting.`,
        'error'
      );
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
        networkName: netDef.name,
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

    const targetNet: MSTNetworkKey = networkKey || doc.networkKey || selectedNetwork || 'testnet';
    const netDef = MST_NETWORKS[targetNet];

    if (!isContractConfigured(targetNet)) {
      if (targetNet === 'mainnet') {
        addToast(
          'MAINNET CONTRACT NOT DEPLOYED/CONFIGURED',
          'Smart contract has not been deployed to MST Chain Mainnet (Chain ID 4646). Revocation cannot proceed.',
          'error'
        );
      } else {
        addToast('Contract Not Deployed', `Smart contract is not configured on ${netDef.name}.`, 'error');
      }
      return false;
    }

    if (walletChainId && !isChainIdMatchingNetwork(walletChainId, targetNet)) {
      addToast(
        'Network Mismatch',
        `Please switch your wallet to ${netDef.name} (${netDef.chainIdDecimal}) before submitting.`,
        'error'
      );
      return false;
    }

    const result = await revokeOnChain(doc.id, reason, rawProvider, targetNet);
    if (result.success) {
      updateDocument(doc.id, { 
        onChainStatus: 'revoked', 
        networkKey: targetNet,
        networkName: netDef.name,
      });
      addToast('Document Revoked', `Document ${doc.id} marked as revoked on ${netDef.name}.`, 'warning');
      return true;
    } else {
      addToast('Revocation Failed', result.error || 'Failed to revoke document.', 'error');
      return false;
    }
  };

  const getDocumentsByPropertyId = (propertyId: string): DocumentRecord[] => {
    if (!propertyId) return [];
    const clean = propertyId.trim().toUpperCase();
    return documents.filter(d => d.propertyId && d.propertyId.toUpperCase() === clean);
  };

  const checkPropertyConflicts = (propertyId: string, currentOwner: string) => {
    if (!propertyId) return { hasConflict: false, existingDocs: [] };
    const clean = propertyId.trim().toUpperCase();
    const existingDocs = documents.filter(d => d.propertyId && d.propertyId.toUpperCase() === clean);
    if (existingDocs.length === 0) {
      return { hasConflict: false, existingDocs: [] };
    }
    const differing = existingDocs.filter(d => d.owner.trim().toLowerCase() !== currentOwner.trim().toLowerCase());
    if (differing.length > 0) {
      return {
        hasConflict: true,
        existingDocs,
        note: `Existing documents for Property ${clean} list a different owner/party ("${differing[0].owner}"). Flagged for registrar review.`
      };
    }
    return { hasConflict: false, existingDocs };
  };

  const resetAllDemoData = () => {
    if (!isSuperAuthor) {
      const errMsg = 'Super Author access required: Only the root Super Author can clear stored data.';
      addToast('Access Denied', errMsg, 'error');
      throw new Error(errMsg);
    }
    resetStorage();
    clearAllLocalPDFs().catch(() => {});
    setDocuments([]);
    setSharedRecords([]);
    setActivities([]);
    if (callerAddress) {
      fetch('http://localhost:5001/api/admin/clear-storage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': callerAddress,
        },
      }).catch(() => {});
    }
    addToast('Repository Reset', 'Local repository and cached PDFs cleared by Super Author. On-chain blockchain records remain immutable.', 'info');
  };

  return (
    <DocumentContext.Provider
      value={{
        documents,
        sharedRecords,
        activities,
        toasts,
        isSyncing,
        syncError,
        syncWithBlockchain,
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
        getDocumentsByPropertyId,
        checkPropertyConflicts,
        checkDocumentIdAvailability,
        generateAvailableDocumentId,
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
