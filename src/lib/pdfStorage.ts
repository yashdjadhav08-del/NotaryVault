/**
 * Local Server-Side & Client Storage Architecture for Original PDF Files in NotaryVault.
 *
 * Requirements:
 * - Stores original PDF files mapped strictly to their canonical Document ID.
 * - Local server-side API (SQLite + local uploads directory outside web root) acts as primary storage.
 * - Private access authorization enforced on all PDF downloads (Owner Session or Private Access Token).
 * - Never uploads raw PDF bytes to the blockchain; blockchain stores cryptographic SHA-256 baseline.
 * - Verifies the downloaded file's SHA-256 against the recorded on-chain baseline before download.
 * - Refuses to describe the file as verified if hashes mismatch (prominent tamper warning).
 * - Explains cross-device, localhost, and authorization requirements clearly.
 */

import { areSha256HashesEqual, toPrefixedSha256 } from './hash.ts';
import { BrowserProvider, ethers } from 'ethers';

export type MSTNetworkKey = 'testnet' | 'mainnet';

function checkChainIdMatchesNetwork(chainId: string | number | bigint, networkKey: MSTNetworkKey): boolean {
  let dec: number;
  if (typeof chainId === 'bigint') {
    dec = Number(chainId);
  } else if (typeof chainId === 'number') {
    dec = chainId;
  } else if (typeof chainId === 'string') {
    dec = chainId.startsWith('0x') || chainId.startsWith('0X')
      ? parseInt(chainId, 16)
      : parseInt(chainId, 10);
  } else {
    return false;
  }
  if (isNaN(dec)) return false;
  if (networkKey === 'testnet') return dec === 91562037;
  if (networkKey === 'mainnet') return dec === 4646;
  return false;
}

export interface StoredLocalPDF {
  id: string; // Canonical Document ID (e.g. NV-2026-000101)
  fileName: string;
  fileSizeBytes: number;
  sha256Hash: string;
  blob: Blob;
  storedAt: string;
  pageCount?: number;
  ownerWallet?: string;
  ownerEmail?: string;
  ownerMobile?: string;
}

export interface VerifiedDownloadResult {
  success: boolean;
  error?: string;
  isTampered?: boolean;
  computedHash?: string;
  expectedHash?: string;
  fileName?: string;
  source?: 'backend' | 'indexeddb' | 'memory';
}

export interface AuthSession {
  token: string;
  walletAddress: string;
  expiresAt: string;
}

const DB_NAME = 'NotaryVault_PDF_Catalog';
const DB_VERSION = 1;
const STORE_NAME = 'original_pdfs';

// In-memory fallback store when IndexedDB is not supported (e.g. Node.js unit tests or incognito restrictions)
const memoryStore = new Map<string, StoredLocalPDF>();

// In-memory active session cache
let activeClientSession: AuthSession | null = null;

export const LOCAL_STORAGE_DISCLAIMER =
  'Original PDFs are confidential and stored securely in local server storage (SQLite + dedicated uploads directory). Server-side authorization is required to access or download private document originals.';

/**
 * Returns the base URL for the local storage API backend.
 */
export function getBackendBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env?.VITE_STORAGE_BACKEND_URL) {
    return process.env.VITE_STORAGE_BACKEND_URL.replace(/\/$/, '');
  }
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_STORAGE_BACKEND_URL) {
    return (import.meta as any).env.VITE_STORAGE_BACKEND_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return '';
  }
  return 'http://localhost:5001';
}

function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.indexedDB);
}

function openPdfDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB is not supported or is disabled in this environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB database.'));
    };
  });
}

// ----------------------------------------------------
// Authentication & Session Management
// ----------------------------------------------------

export function getClientSession(): AuthSession | null {
  if (activeClientSession && new Date().toISOString() < activeClientSession.expiresAt) {
    return activeClientSession;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('notaryvault_auth_session');
      if (stored) {
        const parsed: AuthSession = JSON.parse(stored);
        if (new Date().toISOString() < parsed.expiresAt) {
          activeClientSession = parsed;
          return parsed;
        }
        localStorage.removeItem('notaryvault_auth_session');
      }
    } catch {}
  }
  return null;
}

export function setClientSession(session: AuthSession | null) {
  activeClientSession = session;
  if (typeof window !== 'undefined') {
    try {
      if (session) {
        localStorage.setItem('notaryvault_auth_session', JSON.stringify(session));
      } else {
        localStorage.removeItem('notaryvault_auth_session');
      }
    } catch {}
  }
}

/**
 * Requests a cryptographic authentication challenge for a wallet address.
 */
export async function requestAuthChallenge(address: string): Promise<{
  success: boolean;
  challengeId?: string;
  challengeText?: string;
  expiresAt?: string;
  error?: string;
}> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(`${baseUrl}/api/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return data;
    }
    return { success: false, error: data.error || 'Failed to request authentication challenge.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Authentication server unreachable.' };
  }
}

/**
 * Submits a wallet signature to verify ownership and obtain an authenticated session token.
 */
export async function verifyAuthSignature(params: {
  address: string;
  signature: string;
  challengeId?: string;
  challengeText?: string;
}): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(`${baseUrl}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      const session: AuthSession = {
        token: data.token,
        walletAddress: data.walletAddress,
        expiresAt: data.expiresAt,
      };
      setClientSession(session);
      return { success: true, session };
    }
    return { success: false, error: data.error || 'Signature verification failed.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Verification request failed.' };
  }
}

/**
 * Signs an authentication challenge using the connected wallet.
 * Compatible with ethers v6 BrowserProvider wrapping an EIP-1193 provider (window.ethereum, BridgeKey, EIP-6963),
 * ethers v5/v6 Provider objects with getSigner, direct Signer objects, and raw EIP-1193 providers with personal_sign fallback.
 *
 * Normalizes all error modes into user-friendly messages:
 * - "Wallet is disconnected. Please reconnect your wallet."
 * - "Please approve the wallet signature to authorize document sharing."
 * - "Wrong network. Please switch to the expected MST Chain network."
 * - "Wallet signing is unavailable. Please reconnect your wallet and retry."
 */
export async function signAuthChallengeWithWallet(
  rawProvider: any,
  walletAddress: string,
  challengeText: string,
  options?: { expectedNetworkKey?: MSTNetworkKey }
): Promise<string> {
  if (!rawProvider) {
    throw new Error('Wallet is disconnected. Please reconnect your wallet.');
  }
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    throw new Error('Wallet is disconnected. Please reconnect your wallet.');
  }
  if (!challengeText || typeof challengeText !== 'string') {
    throw new Error('Authentication challenge is missing or invalid.');
  }

  // 1. Verify active chain if expected network is specified
  if (options?.expectedNetworkKey) {
    try {
      let chainIdHex: string | null = null;
      if (typeof rawProvider.request === 'function') {
        chainIdHex = await rawProvider.request({ method: 'eth_chainId' });
      } else if (rawProvider.chainId) {
        chainIdHex = String(rawProvider.chainId);
      }
      if (chainIdHex && !checkChainIdMatchesNetwork(chainIdHex, options.expectedNetworkKey)) {
        throw new Error('Wrong network. Please switch to the expected MST Chain network.');
      }
    } catch (netErr: any) {
      if (netErr?.message?.includes('Wrong network')) {
        throw netErr;
      }
    }
  }

  let signature: string | null = null;

  try {
    // Strategy 1: Direct Signer object (e.g. ethers.Wallet, Hardhat signer, or custom signer with signMessage)
    if (typeof rawProvider.signMessage === 'function') {
      if (typeof rawProvider.getAddress === 'function') {
        const addr = await rawProvider.getAddress();
        if (addr && addr.toLowerCase() !== walletAddress.toLowerCase()) {
          throw new Error('Wallet address mismatch. Please reconnect the correct wallet.');
        }
      }
      signature = await rawProvider.signMessage(challengeText);
    }
    // Strategy 2: Ethers Provider with getSigner() (e.g. BrowserProvider or JsonRpcProvider)
    else if (typeof rawProvider.getSigner === 'function') {
      const signer = await rawProvider.getSigner(walletAddress);
      if (typeof signer.getAddress === 'function') {
        const addr = await signer.getAddress();
        if (addr && addr.toLowerCase() !== walletAddress.toLowerCase()) {
          throw new Error('Wallet address mismatch. Please reconnect the correct wallet.');
        }
      }
      signature = await signer.signMessage(challengeText);
    }
    // Strategy 3: Standard EIP-1193 Provider (e.g. window.ethereum, window.bridgekey, EIP-6963)
    else if (typeof rawProvider.request === 'function') {
      try {
        const browserProvider = new BrowserProvider(rawProvider, 'any');
        const signer = await browserProvider.getSigner(walletAddress);
        if (typeof signer.getAddress === 'function') {
          const addr = await signer.getAddress();
          if (addr && addr.toLowerCase() !== walletAddress.toLowerCase()) {
            throw new Error('Wallet address mismatch. Please reconnect the correct wallet.');
          }
        }
        signature = await signer.signMessage(challengeText);
      } catch (bpErr: any) {
        const errMsg = (bpErr?.message || '').toLowerCase();
        const errCode = bpErr?.code;
        // If user rejected, abort immediately without attempting fallback
        if (
          errCode === 4001 ||
          errCode === 'ACTION_REJECTED' ||
          errMsg.includes('user rejected') ||
          errMsg.includes('user denied') ||
          errMsg.includes('denied') ||
          errMsg.includes('mismatch')
        ) {
          throw bpErr;
        }

        // Strategy 4: Fallback to EIP-1193 direct personal_sign
        const hexMessage = ethers.hexlify(ethers.toUtf8Bytes(challengeText));
        try {
          signature = await rawProvider.request({
            method: 'personal_sign',
            params: [hexMessage, walletAddress],
          });
        } catch (psErr: any) {
          const psMsg = (psErr?.message || '').toLowerCase();
          if (psErr?.code === 4001 || psMsg.includes('user rejected') || psMsg.includes('denied')) {
            throw psErr;
          }
          // Alternative parameter ordering: [address, hexMessage]
          signature = await rawProvider.request({
            method: 'personal_sign',
            params: [walletAddress, hexMessage],
          });
        }
      }
    } else {
      throw new Error('Wallet signing is unavailable. Please reconnect your wallet and retry.');
    }
  } catch (err: any) {
    // Safe developer diagnostic logging without leaking secrets or payload text
    console.warn('[NotaryVault:WalletSigning]', {
      code: err?.code,
      name: err?.name,
      reason: err?.message ? String(err.message).slice(0, 100) : 'Unknown error',
    });

    const errCode = err?.code;
    const errMsg = (err?.message || '').toLowerCase();

    if (
      errCode === 4001 ||
      errCode === 'ACTION_REJECTED' ||
      errMsg.includes('user rejected') ||
      errMsg.includes('user denied') ||
      errMsg.includes('rejected') ||
      errMsg.includes('denied') ||
      errMsg.includes('cancelled')
    ) {
      throw new Error('Please approve the wallet signature to authorize document sharing.');
    }

    if (
      errMsg.includes('disconnected') ||
      errMsg.includes('not connected') ||
      errMsg.includes('no account')
    ) {
      throw new Error('Wallet is disconnected. Please reconnect your wallet.');
    }

    if (errMsg.includes('wrong network') || errMsg.includes('incorrect network')) {
      throw new Error('Wrong network. Please switch to the expected MST Chain network.');
    }

    if (
      errMsg.includes('is not a function') ||
      errMsg.includes('unsupported') ||
      errMsg.includes('unavailable') ||
      errMsg.includes('does not support')
    ) {
      throw new Error('Wallet signing is unavailable. Please reconnect your wallet and retry.');
    }

    if (
      err?.message?.startsWith('Please approve') ||
      err?.message?.startsWith('Wallet is disconnected') ||
      err?.message?.startsWith('Wrong network') ||
      err?.message?.startsWith('Wallet signing is unavailable')
    ) {
      throw err;
    }

    throw new Error(err?.message || 'Wallet signing is unavailable. Please reconnect your wallet and retry.');
  }

  if (!signature || typeof signature !== 'string') {
    throw new Error('Wallet signing is unavailable. Please reconnect your wallet and retry.');
  }

  return signature;
}

/**
 * Authenticates the owner using cryptographic signature and establishes an authenticated session.
 * Reuses existing active session if available and matching.
 */
export async function authenticateOwnerWithWallet(
  rawProvider: any,
  walletAddress: string,
  options?: { expectedNetworkKey?: MSTNetworkKey }
): Promise<AuthSession> {
  const activeAddr = walletAddress?.toLowerCase();
  const existingSession = getClientSession();
  if (existingSession && activeAddr && existingSession.walletAddress.toLowerCase() === activeAddr) {
    return existingSession;
  }

  if (!rawProvider || !walletAddress) {
    throw new Error('Wallet is disconnected. Please reconnect your wallet.');
  }

  const challenge = await requestAuthChallenge(walletAddress);
  if (!challenge.success || !challenge.challengeText) {
    throw new Error(challenge.error || 'Authentication server unreachable. Please retry.');
  }

  const signature = await signAuthChallengeWithWallet(
    rawProvider,
    walletAddress,
    challenge.challengeText,
    options
  );

  const verifyRes = await verifyAuthSignature({
    address: walletAddress,
    signature,
    challengeId: challenge.challengeId,
    challengeText: challenge.challengeText,
  });

  if (!verifyRes.success || !verifyRes.session) {
    throw new Error(verifyRes.error || 'Server authorization rejected cryptographic signature.');
  }

  return verifyRes.session;
}

// ----------------------------------------------------
// Private Access Token Management
// ----------------------------------------------------

export async function createPrivateAccessToken(
  docId: string,
  sessionToken: string,
  expiresInHours: number = 24,
  purpose: string = 'Confidential Access'
): Promise<{ success: boolean; accessToken?: string; expiresAt?: string; error?: string }> {
  try {
    const cleanId = docId.trim().toUpperCase();
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(`${baseUrl}/api/documents/${encodeURIComponent(cleanId)}/access-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ expiresInHours, purpose }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, accessToken: data.accessToken, expiresAt: data.expiresAt };
    }
    return { success: false, error: data.error || 'Failed to generate access token.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Access token generation failed.' };
  }
}

export async function revokePrivateAccessToken(
  docId: string,
  tokenId: string,
  sessionToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanId = docId.trim().toUpperCase();
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(`${baseUrl}/api/documents/${encodeURIComponent(cleanId)}/access-tokens/${encodeURIComponent(tokenId)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
      },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true };
    }
    return { success: false, error: data.error || 'Failed to revoke access token.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Revocation request failed.' };
  }
}

// ----------------------------------------------------
// Document Sharing & Real Multi-Channel Delivery
// ----------------------------------------------------

export interface DocumentShareDeliveryParams {
  documentId: string;
  sessionToken: string;
  recipientEmail?: string;
  recipientMobile?: string;
  sendEmail?: boolean;
  sendSms?: boolean;
  expiryPolicy?: '1h' | '24h' | '7d' | '30d' | '90d' | 'never' | 'no_fixed_expiry' | string;
  purpose?: string;
  recipientConsent?: boolean;
}

export interface DocumentShareResult {
  success: boolean;
  shareId?: string;
  documentId?: string;
  accessToken?: string;
  secureAccessUrl?: string;
  accessPolicy?: string;
  expiresAt?: string | null;
  emailDelivery?: {
    status: 'accepted' | 'unconfigured' | 'failed' | 'skipped';
    deliveryId?: string | null;
    error?: string | null;
    details?: string | null;
  };
  smsDelivery?: {
    status: 'accepted' | 'unconfigured' | 'failed' | 'skipped';
    deliveryId?: string | null;
    error?: string | null;
    details?: string | null;
  };
  error?: string;
  isTampered?: boolean;
}

export interface ServerShareRecord {
  id?: string;
  share_id: string;
  document_id: string;
  owner_wallet: string;
  recipient_email?: string;
  recipient_mobile?: string;
  token_id?: string;
  token_hash?: string;
  access_policy: string;
  expires_at?: string | null;
  created_at: string;
  is_revoked: number;
  send_email: number;
  email_status: string;
  email_delivery_id?: string;
  email_error?: string;
  send_sms: number;
  sms_status: string;
  sms_delivery_id?: string;
  sms_error?: string;
}

export async function shareDocumentWithDelivery(
  params: DocumentShareDeliveryParams
): Promise<DocumentShareResult> {
  try {
    const cleanId = params.documentId.trim().toUpperCase();
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(`${baseUrl}/api/documents/${encodeURIComponent(cleanId)}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${params.sessionToken}`,
      },
      body: JSON.stringify({
        recipientEmail: params.recipientEmail,
        recipientMobile: params.recipientMobile,
        sendEmail: params.sendEmail,
        sendSms: params.sendSms,
        expiryPolicy: params.expiryPolicy,
        purpose: params.purpose,
        recipientConsent: params.recipientConsent,
      }),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      error: `Could not connect to storage server: ${err?.message || 'Connection failed'}`,
    };
  }
}

export async function listDocumentShares(
  documentId: string,
  sessionToken: string
): Promise<{ success: boolean; shares?: ServerShareRecord[]; error?: string }> {
  try {
    const cleanId = documentId.trim().toUpperCase();
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(`${baseUrl}/api/documents/${encodeURIComponent(cleanId)}/shares`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
      },
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to list document shares.' };
  }
}

export async function revokeDocumentShare(
  documentId: string,
  shareId: string,
  sessionToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanId = documentId.trim().toUpperCase();
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(
      `${baseUrl}/api/documents/${encodeURIComponent(cleanId)}/shares/${encodeURIComponent(shareId)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
        },
      }
    );
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to revoke document share.' };
  }
}

// ----------------------------------------------------
// Notifications Client Helpers
// ----------------------------------------------------

export async function getNotificationProviderStatus(): Promise<{
  success: boolean;
  email?: { configured: boolean; provider: string; status: string };
  sms?: { configured: boolean; provider: string; status: string };
  error?: string;
}> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(`${baseUrl}/api/notifications/status`);
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to reach notification service.' };
  }
}

export interface DispatchNotificationsPayload {
  txHash?: string;
  blockNumber?: number;
  ownerEmail?: string;
  ownerMobile?: string;
  documentTitle?: string;
  category?: string;
  issuer?: string;
  registeredAt?: string;
  networkName?: string;
  sha256Hash?: string;
  notificationConsent?: boolean;
}

export async function dispatchDocumentNotifications(
  docId: string,
  payload: DispatchNotificationsPayload
): Promise<{
  success: boolean;
  category?: string;
  error?: string;
  notifications?: {
    email?: { status: string; category?: string; error?: string; provider?: string; deliveryId?: string };
    sms?: { status: string; category?: string; error?: string; provider?: string; deliveryId?: string };
  };
}> {
  try {
    const cleanId = docId.trim().toUpperCase();
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(`${baseUrl}/api/documents/${encodeURIComponent(cleanId)}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    }

    const text = await res.text().catch(() => '');
    const cleanSnippet = text.replace(/<[^>]*>?/gm, '').trim().slice(0, 80) || `HTTP ${res.status}`;
    return {
      success: false,
      category: 'network_error',
      error: `Network/backend connection failed: Storage server returned HTTP ${res.status} (${cleanSnippet}).`,
      notifications: {
        email: {
          status: 'failed',
          category: 'network_error',
          error: `Network/backend connection failed: Storage server returned HTTP ${res.status}. Ensure backend server is running on port 5001.`,
        },
      },
    };
  } catch (err: any) {
    return {
      success: false,
      category: 'network_error',
      error: `Network/backend connection failed: ${err?.message || 'Connection refused.'} Ensure backend storage server is running.`,
      notifications: {
        email: {
          status: 'failed',
          category: 'network_error',
          error: `Network/backend connection failed: ${err?.message || 'Connection refused.'}`,
        },
      },
    };
  }
}

// ----------------------------------------------------
// PDF Upload & Storage
// ----------------------------------------------------

/**
 * Uploads an original PDF directly to the local backend server API.
 */
export async function uploadPdfToServer(
  docId: string,
  fileOrBlob: File | Blob,
  meta: {
    fileName: string;
    sha256Hash: string;
    fileSizeBytes: number;
    pageCount?: number;
    ownerWallet?: string;
    ownerName?: string;
    ownerEmail?: string;
    ownerMobile?: string;
    notificationConsent?: boolean;
    txHash?: string;
    blockNumber?: number;
  }
): Promise<{ success: boolean; error?: string; isConflict?: boolean }> {
  try {
    const cleanId = docId.trim().toUpperCase();
    const baseUrl = getBackendBaseUrl();
    const endpoint = `${baseUrl}/api/documents/${encodeURIComponent(cleanId)}/upload`;

    const buffer = await fileOrBlob.arrayBuffer();
    const cleanHash = meta.sha256Hash ? meta.sha256Hash.trim().toLowerCase() : '';
    const normalizedHash = cleanHash.startsWith('0x') ? cleanHash : (cleanHash ? `0x${cleanHash}` : '');

    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
      'X-File-Name': encodeURIComponent(meta.fileName),
      ...(normalizedHash ? { 'X-SHA256-Hash': normalizedHash } : {}),
      ...(meta.pageCount ? { 'X-Page-Count': String(meta.pageCount) } : {}),
      ...(meta.ownerWallet ? { 'X-Owner-Wallet': meta.ownerWallet.trim().toLowerCase() } : {}),
      ...(meta.ownerName ? { 'X-Owner-Name': encodeURIComponent(meta.ownerName.trim()) } : {}),
      ...(meta.ownerEmail ? { 'X-Owner-Email': encodeURIComponent(meta.ownerEmail.trim()) } : {}),
      ...(meta.ownerMobile ? { 'X-Owner-Mobile': encodeURIComponent(meta.ownerMobile.trim()) } : {}),
      ...(meta.notificationConsent ? { 'X-Notification-Consent': 'true' } : {}),
      ...(meta.txHash ? { 'X-Tx-Hash': meta.txHash } : {}),
      ...(meta.blockNumber ? { 'X-Block-Number': String(meta.blockNumber) } : {}),
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: buffer,
    });

    if (res.ok) {
      return { success: true };
    }

    const errData = await res.json().catch(() => ({}));
    const isConflict = res.status === 409;
    return {
      success: false,
      isConflict,
      error: errData.error || `Local backend storage error (HTTP ${res.status}).`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Could not reach local storage backend: ${err?.message || 'Connection refused.'}`,
    };
  }
}

/**
 * Verifies that the original PDF for a Document ID actually exists on disk in backend storage,
 * and that reading back the file from disk yields a SHA-256 digest matching the expected hash.
 */
export async function verifyServerStorage(
  docId: string,
  expectedHash?: string
): Promise<{
  verified: boolean;
  documentId?: string;
  sha256Hash?: string;
  fileSizeBytes?: number;
  storedAt?: string;
  diskHashVerified?: boolean;
  error?: string;
}> {
  try {
    const cleanId = docId.trim().toUpperCase();
    const baseUrl = getBackendBaseUrl();
    const endpoint = `${baseUrl}/api/documents/${encodeURIComponent(cleanId)}/verify-storage`;

    const res = await fetch(endpoint);
    if (res.ok) {
      const data = await res.json();
      if (expectedHash && data.sha256Hash) {
        if (!areSha256HashesEqual(data.sha256Hash, expectedHash)) {
          return {
            verified: false,
            error: `Server stored file hash (${toPrefixedSha256(data.sha256Hash)}) does not match expected hash (${toPrefixedSha256(expectedHash)}).`,
          };
        }
      }
      return {
        verified: true,
        documentId: data.documentId,
        sha256Hash: data.sha256Hash,
        fileSizeBytes: data.fileSizeBytes,
        storedAt: data.storedAt,
        diskHashVerified: Boolean(data.diskHashVerified),
      };
    }

    const errData = await res.json().catch(() => ({}));
    return {
      verified: false,
      error: errData.error || `Server verification failed with HTTP ${res.status}.`,
    };
  } catch (err: any) {
    return {
      verified: false,
      error: `Could not connect to storage backend for verification: ${err?.message || 'Connection refused.'}`,
    };
  }
}

/**
 * Persists confirmed blockchain registration metadata to the server database.
 */
export async function confirmServerRegistration(
  docId: string,
  details: {
    txHash: string;
    blockNumber?: number;
    networkName?: string;
    chainId?: number | string;
    contractAddress?: string;
    title?: string;
    category?: string;
    issuer?: string;
    status?: string;
    registrantAddress?: string;
    ownerWallet?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanId = docId.trim().toUpperCase();
    const baseUrl = getBackendBaseUrl();
    const endpoint = `${baseUrl}/api/documents/${encodeURIComponent(cleanId)}/confirm-registration`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(details),
    });

    if (res.ok) {
      return { success: true };
    }

    const errData = await res.json().catch(() => ({}));
    return {
      success: false,
      error: errData.error || `Failed to update registration status on server (HTTP ${res.status}).`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Could not reach server to confirm registration: ${err?.message || 'Connection refused.'}`,
    };
  }
}

/**
 * Fetches an original PDF directly from the local backend server API.
 * Enforces server-side authorization: requires either an authenticated session token or an access token.
 */
export async function fetchPdfFromServer(
  docId: string,
  auth?: { sessionToken?: string; accessToken?: string }
): Promise<{
  success: boolean;
  blob?: Blob;
  fileName?: string;
  sha256Hash?: string;
  error?: string;
  status?: number;
}> {
  try {
    const cleanId = docId.trim().toUpperCase();
    const baseUrl = getBackendBaseUrl();
    let endpoint = `${baseUrl}/api/documents/${encodeURIComponent(cleanId)}/download`;

    const headers: Record<string, string> = {};
    if (auth?.sessionToken) {
      headers['Authorization'] = `Bearer ${auth.sessionToken}`;
    }
    if (auth?.accessToken) {
      // Pass bearer token strictly via HTTP header to prevent leaking into URL query parameters or proxy logs
      headers['X-Access-Token'] = auth.accessToken;
    }

    const res = await fetch(endpoint, { headers });
    if (res.ok) {
      const blob = await res.blob();
      const contentDisp = res.headers.get('Content-Disposition') || '';
      let fileName = `${cleanId}.pdf`;
      const fnMatch = contentDisp.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      if (fnMatch && fnMatch[1]) {
        fileName = decodeURIComponent(fnMatch[1].trim());
      }
      const sha256Hash = res.headers.get('X-SHA256-Hash') || undefined;
      return { success: true, blob, fileName, sha256Hash, status: res.status };
    }

    const errData = await res.json().catch(() => ({}));
    return {
      success: false,
      status: res.status,
      error: errData.error || `Server returned HTTP ${res.status}`,
    };
  } catch (err: any) {
    return { success: false, error: `Local storage server unavailable: ${err?.message || 'Connection refused.'}` };
  }
}

/**
 * Persists an original PDF file associated strictly with its canonical Document ID.
 * Stores to local backend server (SQLite + filesystem) as well as local client storage.
 * Refuses to silently overwrite an existing registered PDF under the same ID.
 */
export async function saveLocalPDF(
  docId: string,
  fileOrBlob: File | Blob,
  meta: {
    fileName: string;
    sha256Hash: string;
    fileSizeBytes: number;
    pageCount?: number;
    ownerWallet?: string;
    ownerEmail?: string;
    ownerMobile?: string;
    notificationConsent?: boolean;
    txHash?: string;
    blockNumber?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  const cleanId = docId.trim().toUpperCase();

  // 1. Attempt upload to local server-side backend API
  const serverRes = await uploadPdfToServer(cleanId, fileOrBlob, meta);
  if (!serverRes.success && serverRes.isConflict) {
    return {
      success: false,
      error: serverRes.error || `Document ID "${cleanId}" is already registered with a different original file. Overwriting registered originals is prohibited.`,
    };
  }

  // 2. Persist to client storage (IndexedDB / memoryStore)
  const record: StoredLocalPDF = {
    id: cleanId,
    fileName: meta.fileName,
    fileSizeBytes: meta.fileSizeBytes || fileOrBlob.size,
    sha256Hash: meta.sha256Hash.toLowerCase(),
    blob: fileOrBlob instanceof Blob ? fileOrBlob : new Blob([fileOrBlob], { type: 'application/pdf' }),
    storedAt: new Date().toISOString(),
    pageCount: meta.pageCount,
    ownerWallet: meta.ownerWallet,
    ownerEmail: meta.ownerEmail,
    ownerMobile: meta.ownerMobile,
  };

  if (!isIndexedDbAvailable()) {
    if (memoryStore.has(cleanId)) {
      const existing = memoryStore.get(cleanId);
      if (existing?.sha256Hash.toLowerCase() === meta.sha256Hash.toLowerCase()) {
        return { success: true };
      }
      return {
        success: false,
        error: `Document ID "${cleanId}" already has an original PDF stored locally. Silently replacing registered documents is prohibited.`,
      };
    }
    memoryStore.set(cleanId, record);
    return { success: true };
  }

  try {
    const db = await openPdfDatabase();

    const existing = await new Promise<StoredLocalPDF | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cleanId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (existing) {
      if (existing.sha256Hash.toLowerCase() === meta.sha256Hash.toLowerCase()) {
        return { success: true };
      }
      return {
        success: false,
        error: `Document ID "${cleanId}" already has an original PDF stored locally. Silently replacing registered documents is prohibited.`,
      };
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });

    return { success: true };
  } catch (err: any) {
    console.warn('[pdfStorage] Failed to save PDF to IndexedDB:', err);
    if (err.name === 'QuotaExceededError') {
      return {
        success: false,
        error: 'Browser storage quota exceeded. The document metadata was saved, but the local PDF copy could not be stored.',
      };
    }
    return {
      success: false,
      error: `Local PDF storage unavailable: ${err?.message || 'Storage error'}.`,
    };
  }
}

/**
 * Retrieves a stored local PDF strictly by its exact canonical Document ID.
 */
export async function getLocalPDF(docId: string): Promise<StoredLocalPDF | null> {
  const cleanId = docId.trim().toUpperCase();

  if (!isIndexedDbAvailable()) {
    return memoryStore.get(cleanId) || null;
  }

  try {
    const db = await openPdfDatabase();
    return await new Promise<StoredLocalPDF | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cleanId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memoryStore.get(cleanId) || null;
  }
}

/**
 * Checks whether an original PDF is currently stored for a Document ID.
 */
export async function hasLocalPDF(docId: string): Promise<boolean> {
  const cleanId = docId.trim().toUpperCase();

  // 1. Check local backend server metadata
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(`${baseUrl}/api/documents/${encodeURIComponent(cleanId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.exists) return true;
    }
  } catch {
    // Backend offline or unreachable
  }

  // 2. Check local client IndexedDB / memory store
  const item = await getLocalPDF(cleanId);
  return Boolean(item && item.blob);
}

/**
 * Checks document presence and metadata on the server storage endpoint.
 */
export async function checkServerDocument(docId: string): Promise<{
  exists: boolean;
  sha256Hash?: string;
  fileName?: string;
  fileSizeBytes?: number;
  error?: string;
  status?: number;
}> {
  try {
    const cleanId = docId.trim().toUpperCase();
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(`${baseUrl}/api/documents/${encodeURIComponent(cleanId)}`);
    if (res.ok) {
      const data = await res.json();
      return {
        exists: Boolean(data?.exists),
        sha256Hash: data?.sha256Hash,
        fileName: data?.fileName,
        fileSizeBytes: data?.fileSizeBytes,
        status: res.status,
      };
    }
    const errData = await res.json().catch(() => ({}));
    return {
      exists: false,
      status: res.status,
      error: errData.error || `Server returned HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      exists: false,
      error: `Could not reach server storage: ${err?.message || 'Connection refused.'}`,
    };
  }
}

/**
 * Helper to compute SHA-256 hash across browser and Node.js environments.
 */
export async function computeSha256(arrayBuffer: ArrayBuffer): Promise<string> {
  const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle)
    || (typeof window !== 'undefined' && window.crypto?.subtle);

  if (subtle) {
    const hashBuffer = await subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return '0x' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  try {
    const modName = 'crypto';
    const nodeCrypto = await import(/* @vite-ignore */ modName);
    return '0x' + nodeCrypto.createHash('sha256').update(Buffer.from(arrayBuffer)).digest('hex');
  } catch {
    throw new Error('Cryptographic SHA-256 digest engine unavailable.');
  }
}

export interface RetrySyncResult {
  success: boolean;
  reason?: 'already_on_server' | 'synced_from_local' | 'pdf_missing_everywhere' | 'local_hash_mismatch' | 'server_hash_mismatch' | 'upload_failed' | 'server_verification_failed';
  error?: string;
  isConflict?: boolean;
}

/**
 * Synchronizes and verifies the original PDF for an existing confirmed registration.
 * 1. Checks if server storage already possesses the verified PDF.
 * 2. If missing on server, retrieves the local PDF (IndexedDB or memory).
 * 3. Verifies the PDF's SHA-256 hash against the on-chain registered baseline.
 * 4. Uploads the verified PDF to the backend server.
 * 5. Confirms server recognizes the uploaded file under the canonical Document ID.
 */
export async function syncAndVerifyPdfForRetry(
  docId: string,
  expectedHash: string,
  localBlob: Blob | File | null,
  meta: {
    fileName: string;
    fileSizeBytes?: number;
    pageCount?: number;
    ownerWallet?: string;
    ownerEmail?: string;
    ownerMobile?: string;
    notificationConsent?: boolean;
    txHash?: string;
    blockNumber?: number;
  }
): Promise<RetrySyncResult> {
  const cleanId = docId.trim().toUpperCase();

  console.log(`[RetryWorkflow] Starting PDF sync check for Document ID: ${cleanId}`);

  // 1. Check if server already has the file
  const serverCheck = await checkServerDocument(cleanId);
  if (serverCheck.exists && serverCheck.sha256Hash) {
    if (areSha256HashesEqual(serverCheck.sha256Hash, expectedHash)) {
      console.log(`[RetryWorkflow] PDF is already securely present in server storage for ${cleanId}`);
      return { success: true, reason: 'already_on_server' };
    } else {
      console.warn(`[RetryWorkflow] Hash mismatch on server for ${cleanId}: stored ${serverCheck.sha256Hash} != expected ${expectedHash}`);
      return {
        success: false,
        reason: 'server_hash_mismatch',
        error: `Server stored PDF SHA-256 hash (${toPrefixedSha256(serverCheck.sha256Hash)}) does not match registered on-chain baseline (${toPrefixedSha256(expectedHash)}).`,
      };
    }
  }

  // 2. Server does not have the file. Check if local PDF is available
  if (!localBlob) {
    console.warn(`[RetryWorkflow] Original PDF not found in local storage or server storage for ${cleanId}`);
    return {
      success: false,
      reason: 'pdf_missing_everywhere',
      error: 'The original PDF is unavailable in local and server storage. Please upload the original file again to continue.',
    };
  }

  // 3. Verify local PDF SHA-256 hash before uploading
  try {
    const arrayBuf = await localBlob.arrayBuffer();
    const computedHash = await computeSha256(arrayBuf);
    if (!areSha256HashesEqual(computedHash, expectedHash)) {
      console.warn(`[RetryWorkflow] Local PDF SHA-256 integrity check failed for ${cleanId}: computed ${computedHash} != expected ${expectedHash}`);
      return {
        success: false,
        reason: 'local_hash_mismatch',
        error: `Local PDF SHA-256 hash (${toPrefixedSha256(computedHash)}) does not match registered on-chain baseline (${toPrefixedSha256(expectedHash)}). Silently replacing registered documents is prohibited.`,
      };
    }
  } catch (hashErr: any) {
    return {
      success: false,
      reason: 'local_hash_mismatch',
      error: `Failed to compute local PDF SHA-256 hash: ${hashErr?.message || 'Digest failure'}`,
    };
  }

  // 4. Upload verified local PDF to backend
  console.log(`[RetryWorkflow] Uploading verified local PDF to server storage for ${cleanId}...`);
  const uploadRes = await uploadPdfToServer(cleanId, localBlob, {
    fileName: meta.fileName,
    sha256Hash: toPrefixedSha256(expectedHash),
    fileSizeBytes: meta.fileSizeBytes || localBlob.size,
    pageCount: meta.pageCount,
    ownerWallet: meta.ownerWallet,
    ownerEmail: meta.ownerEmail,
    ownerMobile: meta.ownerMobile,
    notificationConsent: meta.notificationConsent ?? true,
    txHash: meta.txHash,
    blockNumber: meta.blockNumber,
  });

  if (!uploadRes.success) {
    console.warn(`[RetryWorkflow] Server upload failed for ${cleanId}:`, uploadRes.error);
    return {
      success: false,
      reason: 'upload_failed',
      isConflict: uploadRes.isConflict,
      error: uploadRes.error || 'Server storage upload failed.',
    };
  }

  // 5. Confirm server recognizes uploaded file under expected document ID and hash
  const postUploadCheck = await checkServerDocument(cleanId);
  if (!postUploadCheck.exists) {
    return {
      success: false,
      reason: 'server_verification_failed',
      error: 'Server upload succeeded but document record could not be confirmed in server catalog.',
    };
  }

  if (postUploadCheck.sha256Hash && !areSha256HashesEqual(postUploadCheck.sha256Hash, expectedHash)) {
    return {
      success: false,
      reason: 'server_hash_mismatch',
      error: 'Server recognized uploaded file but SHA-256 hash verification failed.',
    };
  }

  console.log(`[RetryWorkflow] PDF successfully synced and verified on server for ${cleanId}`);
  return { success: true, reason: 'synced_from_local' };
}

/**
 * Downloads the exact original PDF associated with the canonical Document ID
 * after verifying server-side authorization and checking its SHA-256 hash against the on-chain recorded hash.
 * Refuses to describe the file as verified or initiate download if hashes mismatch or if unauthorized.
 */
export async function downloadVerifiedOriginalPDF(
  docId: string,
  expectedHash?: string,
  fallbackFileName?: string,
  auth?: { sessionToken?: string; accessToken?: string; ownerWallet?: string }
): Promise<VerifiedDownloadResult> {
  try {
    const cleanId = docId.trim().toUpperCase();

    // Resolve active session if none provided explicitly
    const sessionToUse = auth?.sessionToken || getClientSession()?.token;
    const authCredentials = {
      sessionToken: sessionToUse,
      accessToken: auth?.accessToken,
    };

    // 1. Try local server-side backend API first
    let sourceBlob: Blob | null = null;
    let resolvedFileName: string | undefined = undefined;
    let storageSource: 'backend' | 'indexeddb' | 'memory' = 'backend';

    const serverFetch = await fetchPdfFromServer(cleanId, authCredentials);
    if (serverFetch.success && serverFetch.blob) {
      sourceBlob = serverFetch.blob;
      resolvedFileName = serverFetch.fileName || fallbackFileName || `${cleanId}.pdf`;
      storageSource = 'backend';
    } else if (serverFetch.status === 401 || serverFetch.status === 403) {
      // Authorization strictly failed on server - IndexedDB fallback MUST NOT bypass server authorization!
      return {
        success: false,
        error: serverFetch.error || 'Access Denied: You do not have permission to download this original PDF.',
      };
    } else {
      // 2. Fall back to local client IndexedDB ONLY IF server is unreachable AND authorization is satisfied
      const localRecord = await getLocalPDF(cleanId);
      if (localRecord && localRecord.blob) {
        if (localRecord.ownerWallet) {
          const isOwner = auth?.ownerWallet && auth.ownerWallet.toLowerCase() === localRecord.ownerWallet.toLowerCase();
          const hasSession = Boolean(sessionToUse);
          if (!isOwner && !hasSession && !auth?.accessToken) {
            return {
              success: false,
              error: 'Authentication Required: You are not authorized to download this private document.',
            };
          }
        }
        sourceBlob = localRecord.blob;
        resolvedFileName = localRecord.fileName || fallbackFileName || `${cleanId}.pdf`;
        storageSource = isIndexedDbAvailable() ? 'indexeddb' : 'memory';
      }
    }

    if (!sourceBlob) {
      return {
        success: false,
        error: `Original PDF for Document ID "${cleanId}" is not stored on this local server or device. Ensure the local storage server or IndexedDB holds the registered file and you are authenticated as the owner.`,
      };
    }

    // Exact byte SHA-256 hash calculation
    const arrayBuffer = await sourceBlob.arrayBuffer();
    const computedHash = await computeSha256(arrayBuffer);

    // Verify against on-chain recorded hash
    if (expectedHash && expectedHash.trim()) {
      if (!areSha256HashesEqual(computedHash, expectedHash)) {
        return {
          success: false,
          isTampered: true,
          computedHash: toPrefixedSha256(computedHash),
          expectedHash: toPrefixedSha256(expectedHash),
          fileName: resolvedFileName,
          error: `Tamper Warning: The computed SHA-256 digest of the retrieved file (${toPrefixedSha256(computedHash)}) does not match the registered on-chain baseline (${toPrefixedSha256(expectedHash)}). PDF Hash Integrity Verification Failed — Stored file SHA-256 hash does not match registered on-chain hash. This file may have been modified or tampered with.`,
        };
      }
    }

    const fileName = resolvedFileName || `${cleanId}.pdf`;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const url = URL.createObjectURL(sourceBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return {
      success: true,
      computedHash,
      expectedHash,
      fileName,
      source: storageSource,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Download error: ${err?.message || 'Failed to download original PDF.'}`,
    };
  }
}

/**
 * Triggers a browser download of the locally stored original PDF file with authorization.
 */
export async function downloadLocalPDF(
  docId: string,
  fallbackFileName?: string,
  auth?: { sessionToken?: string; accessToken?: string; ownerWallet?: string }
): Promise<boolean> {
  const result = await downloadVerifiedOriginalPDF(docId, undefined, fallbackFileName, auth);
  return result.success;
}

/**
 * Removes a local PDF from storage (both server and client store).
 */
export async function removeLocalPDF(docId: string): Promise<boolean> {
  const cleanId = docId.trim().toUpperCase();
  memoryStore.delete(cleanId);

  try {
    const baseUrl = getBackendBaseUrl();
    await fetch(`${baseUrl}/api/documents/${encodeURIComponent(cleanId)}`, { method: 'DELETE' });
  } catch {}

  if (!isIndexedDbAvailable()) return true;

  try {
    const db = await openPdfDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const delReq = store.delete(cleanId);
      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears all stored PDFs from local client storage.
 */
export async function clearAllLocalPDFs(): Promise<void> {
  memoryStore.clear();

  if (!isIndexedDbAvailable()) return;

  try {
    const db = await openPdfDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const clearReq = store.clear();
      clearReq.onsuccess = () => resolve();
      clearReq.onerror = () => reject(clearReq.error);
    });
  } catch {
    // Graceful fallback
  }
}
