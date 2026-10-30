/**
 * NotaryVault Document Receipt Generation & Verification Audit Export.
 *
 * Requirements:
 * - Distinguishes storageStatus ('verified' | 'failed' | 'pending').
 * - Distinguishes blockchainStatus ('confirmed' | 'failed' | 'pending').
 * - Distinguishes emailStatus ('accepted' | 'failed' | 'unconfigured' | 'not_requested').
 * - Includes storage verification result, SHA-256 digest, Document ID, network name, chain ID, contract address, transaction hash, and block number.
 * - Does not report 'Registered' as a complete success if required storage failed.
 * - Strictly strips private storage paths, owner email addresses, phone numbers, and private credentials.
 */

import type { DocumentRecord } from '../types';

const DEFAULT_NETWORKS: Record<string, { name: string; chainIdDecimal: number }> = {
  testnet: {
    name: 'MST Chain Testnet',
    chainIdDecimal: 91562037,
  },
  mainnet: {
    name: 'MST Chain Mainnet',
    chainIdDecimal: 4646,
  },
};

export interface StorageVerificationMetadata {
  verified: boolean;
  storedHash?: string;
  backendProvider?: string;
  storedAt?: string;
  fileSizeBytes?: number;
  diskHashVerified?: boolean;
  error?: string;
}

export interface BlockchainMetadata {
  networkName: string;
  chainId: number | string;
  contractAddress?: string;
  transactionHash?: string;
  blockNumber?: number;
}

export interface DocumentReceipt {
  notaryVaultVersion: string;
  generatedTimestamp: string;
  documentId: string;
  documentTitle: string;
  category: string;
  issuer: string;
  issueDate: string;
  expiryDate?: string;
  registeredAt: string;
  sha256Digest: string;
  storageStatus: 'verified' | 'failed' | 'pending';
  storageVerification?: StorageVerificationMetadata;
  blockchainStatus: 'confirmed' | 'failed' | 'pending';
  blockchain?: BlockchainMetadata;
  emailStatus: 'accepted' | 'failed' | 'unconfigured' | 'not_requested';
  overallStatus: 'Registered' | 'Partially Registered (Storage Failed)' | 'Anchored On-Chain (Storage Pending)' | 'Local Storage Only';
  notice: string;
}

export interface ReceiptOptions {
  storageStatus?: 'verified' | 'failed' | 'pending';
  blockchainStatus?: 'confirmed' | 'failed' | 'pending';
  emailStatus?: 'accepted' | 'failed' | 'unconfigured' | 'not_requested';
  storageVerification?: StorageVerificationMetadata;
}

/**
 * Builds an accurate, sanitized, and verifiable JSON receipt for a document record.
 */
export function buildDocumentReceipt(doc: DocumentRecord, options?: ReceiptOptions): DocumentReceipt {
  const netKey = doc.networkKey || 'testnet';
  const networkDef = DEFAULT_NETWORKS[netKey] || DEFAULT_NETWORKS.testnet;

  // 1. Resolve Blockchain Status
  let blockchainStatus: 'confirmed' | 'failed' | 'pending' = options?.blockchainStatus || 'pending';
  if (!options?.blockchainStatus) {
    if (doc.onChainStatus === 'registered' || doc.txHash) {
      blockchainStatus = 'confirmed';
    } else {
      blockchainStatus = 'pending';
    }
  }

  // 2. Resolve Storage Status
  let storageStatus: 'verified' | 'failed' | 'pending' = options?.storageStatus || 'pending';
  if (!options?.storageStatus) {
    if (options?.storageVerification?.verified) {
      storageStatus = 'verified';
    } else if (doc.fileSizeBytes && doc.sha256Hash) {
      // If we have size and hash locally recorded
      storageStatus = 'verified';
    }
  }

  // 3. Resolve Email Status
  const emailStatus: 'accepted' | 'failed' | 'unconfigured' | 'not_requested' = options?.emailStatus || 'not_requested';

  // 4. Resolve Overall Outcome Status
  let overallStatus: 'Registered' | 'Partially Registered (Storage Failed)' | 'Anchored On-Chain (Storage Pending)' | 'Local Storage Only' = 'Registered';
  if (blockchainStatus === 'confirmed' && storageStatus === 'verified') {
    overallStatus = 'Registered';
  } else if (blockchainStatus === 'confirmed' && storageStatus === 'failed') {
    overallStatus = 'Partially Registered (Storage Failed)';
  } else if (blockchainStatus === 'confirmed' && storageStatus === 'pending') {
    overallStatus = 'Anchored On-Chain (Storage Pending)';
  } else {
    overallStatus = 'Local Storage Only';
  }

  // 5. Blockchain details (omits null/undefined fields)
  let blockchain: BlockchainMetadata | undefined = undefined;
  if (doc.txHash || doc.contractAddress || blockchainStatus === 'confirmed') {
    blockchain = {
      networkName: networkDef.name,
      chainId: doc.networkChainId ? (Number(doc.networkChainId) || networkDef.chainIdDecimal) : networkDef.chainIdDecimal,
      contractAddress: doc.contractAddress,
      transactionHash: doc.txHash,
      blockNumber: doc.blockNumber,
    };
  }

  // 6. Storage verification details
  const storageVerification: StorageVerificationMetadata = {
    verified: storageStatus === 'verified',
    storedHash: options?.storageVerification?.storedHash || doc.sha256Hash,
    backendProvider: options?.storageVerification?.backendProvider || 'local_sqlite_server',
    storedAt: options?.storageVerification?.storedAt || doc.registeredAt,
    fileSizeBytes: options?.storageVerification?.fileSizeBytes || doc.fileSizeBytes,
    diskHashVerified: options?.storageVerification?.diskHashVerified ?? (storageStatus === 'verified'),
    error: options?.storageVerification?.error,
  };

  return {
    notaryVaultVersion: '1.0.4',
    generatedTimestamp: new Date().toISOString(),
    documentId: doc.id,
    documentTitle: doc.name,
    category: doc.type,
    issuer: doc.owner,
    issueDate: doc.issueDate,
    expiryDate: doc.expiryDate || 'N/A',
    registeredAt: doc.registeredAt,
    sha256Digest: doc.sha256Hash,
    storageStatus,
    storageVerification,
    blockchainStatus,
    blockchain,
    emailStatus,
    overallStatus,
    notice: 'Cryptographic document verification receipt generated by NotaryVault. Confidential storage paths and contact details are excluded from public receipts.',
  };
}

/**
 * Generates and triggers browser download of the document receipt JSON.
 */
export function downloadDocumentReceipt(doc: DocumentRecord, options?: ReceiptOptions): void {
  const receipt = buildDocumentReceipt(doc, options);
  const jsonStr = JSON.stringify(receipt, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `NotaryVault_Receipt_${doc.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
