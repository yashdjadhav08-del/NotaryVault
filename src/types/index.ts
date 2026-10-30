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
  pageCount?: number;
  qrPayloadUrl: string;

  // Property identification and grouping
  propertyId?: string; // e.g. PROP-2026-0891
  hasConflictWarning?: boolean;
  conflictNotes?: string;

  // On-chain verification & MST Chain integration attributes
  txHash?: string;
  blockNumber?: number;
  contractAddress?: string;
  networkChainId?: string;
  networkKey?: 'testnet' | 'mainnet';
  onChainStatus?: 'unregistered' | 'registered' | 'revoked';
  registrantAddress?: string;
  ownerEmail?: string;
  ownerMobile?: string;
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

export type AuthorRole = 'super_author' | 'secondary_author' | 'public_user';

export type ApplicationStatus = 'Pending' | 'Approved' | 'Rejected';

export interface AuthorApplication {
  id: string; // e.g. APP-2026-000101
  applicantWallet: string;
  applicantName: string;
  organization: string;
  licenseNumber: string;
  contactEmail: string;
  justification: string;
  submittedAt: string;
  status: ApplicationStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  approvalTxHash?: string;
  submissionTxHash?: string;
  networkKey?: 'testnet' | 'mainnet';
}

export interface AuthorizedAuthorRecord {
  walletAddress: string;
  name: string;
  organization: string;
  licenseNumber: string;
  role: 'secondary_author';
  authorizedAt: string;
  authorizedBy: string;
  txHash?: string;
  isActive: boolean;
  networkKey?: 'testnet' | 'mainnet';
}

export type ActivityEventType = 
  | 'Document Registered'
  | 'Verification Requested'
  | 'Verification Completed'
  | 'Document Shared'
  | 'Access Revoked'
  | 'Document Details Updated'
  | 'Author Application Submitted'
  | 'Author Application Approved'
  | 'Author Application Rejected'
  | 'Author Permissions Revoked';

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
  contractAddress?: string;
  isHistorical?: boolean;
  txHash?: string;
}
