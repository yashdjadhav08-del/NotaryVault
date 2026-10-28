export type DocumentType = 
  | 'Property Deed'
  | 'Sale Agreement'
  | 'Rental Agreement'
  | 'Affidavit'
  | 'Power of Attorney';

export type DocumentStatus = 
  | 'Verified'
  | 'Pending'
  | 'Hash Mismatch'
  | 'Registered';

export type VerificationState = 
  | 'verified'
  | 'not_found'
  | 'mismatch'
  | 'pending';

export interface DocumentRecord {
  id: string; // e.g. NV-2026-000101
  name: string;
  type: DocumentType;
  description: string;
  owner: string;
  issueDate: string;
  expiryDate?: string;
  registeredAt: string;
  status: DocumentStatus;
  sha256Hash: string;
  fileName: string;
  fileSizeBytes: number;
  qrPayloadUrl: string;

  // On-chain verification & MST Chain integration attributes
  txHash?: string;
  blockNumber?: number;
  contractAddress?: string;
  networkChainId?: string;
  networkKey?: 'testnet' | 'mainnet';
  onChainStatus?: 'unregistered' | 'registered' | 'revoked';
  registrantAddress?: string;
}

export type AccessStatus = 'Active' | 'Expired' | 'Revoked';

export interface SharedRecord {
  id: string;
  documentId: string;
  documentName: string;
  recipient: string;
  sharedAt: string;
  expiresAt: string;
  status: AccessStatus;
  accessCount: number;
}

export type ActivityEventType = 
  | 'Document Registered'
  | 'Verification Requested'
  | 'Verification Completed'
  | 'Document Shared'
  | 'Access Revoked'
  | 'Document Details Updated';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  description: string;
  documentId?: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error' | 'info';
}

export interface VerificationCheckResult {
  state: VerificationState;
  document?: DocumentRecord;
  submittedHash?: string;
  storedHash?: string;
  message: string;
  details: string;
  timestamp: string;

  // On-chain verification metadata
  onChainVerified?: boolean;
  onChainRegistrant?: string;
  onChainTimestamp?: number;
  isRevokedOnChain?: boolean;
  networkKey?: 'testnet' | 'mainnet';
  txHash?: string;
}
