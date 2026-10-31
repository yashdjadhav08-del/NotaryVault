/**
 * Local Server-Side & Shared Object Storage Architecture Specification for NotaryVault.
 *
 * Current Architecture:
 * - Blockchain Layer: MST Chain Testnet smart contracts store Document ID, SHA-256 cryptographic digest,
 *   registrant address, and timestamp. Raw PDF bytes are NEVER stored on-chain.
 * - Local Server Storage Layer: Original PDF files are stored on the local backend server (SQLite database + dedicated uploads directory).
 * - Client Fallback Layer: Browser IndexedDB provides local offline caching for the registrant.
 * - Security Model: Protects party privacy and sensitive document contents by default.
 * - Localhost Reality: Local development server is bound to localhost; files are not automatically accessible across devices unless networked.
 */

export type StorageProviderType = 'local_sqlite_server' | 'indexeddb_local' | 's3_compatible' | 'ipfs' | 'custom_api';

export interface StorageArchitectureStatus {
  provider: StorageProviderType;
  isSharedCrossDevice: boolean;
  limitationNotice: string;
  missingSetupSteps: string[];
}

/**
 * Returns the current storage architecture status.
 * Correctly identifies local server-side SQLite storage and cross-device limitations.
 */
export function getStorageArchitectureStatus(): StorageArchitectureStatus {
  let customBackendUrl = '';
  if (typeof process !== 'undefined' && process.env) {
    customBackendUrl = process.env.VITE_STORAGE_SERVER_URL || process.env.VITE_STORAGE_BACKEND_URL || process.env.VITE_API_URL || '';
  } else if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const meta = (import.meta as any).env;
    customBackendUrl = meta.VITE_STORAGE_SERVER_URL || meta.VITE_STORAGE_BACKEND_URL || meta.VITE_API_URL || '';
  }

  if (customBackendUrl && !customBackendUrl.includes('localhost') && !customBackendUrl.includes('127.0.0.1')) {
    return {
      provider: 'custom_api',
      isSharedCrossDevice: true,
      limitationNotice: 'Connected to shared remote object storage backend. Original PDFs can be downloaded across devices with cryptographic verification.',
      missingSetupSteps: [],
    };
  }

  return {
    provider: 'local_sqlite_server',
    isSharedCrossDevice: false,
    limitationNotice:
      'Original PDFs are stored in local server-side storage (SQLite + dedicated uploads directory outside public web root). Note: localhost is accessible on this machine only and is not automatically reachable from another device unless bound to a local network IP. Local files reside on this machine only and cannot be recovered if deleted without a backup.',
    missingSetupSteps: [
      'To enable cross-device downloads across your local network, start the server bound to your local IP address (e.g. 192.168.x.x) and set VITE_STORAGE_BACKEND_URL.',
      'For cloud cross-device production access, deploy an S3-compatible or private object store (e.g. MinIO, Cloudflare R2, AWS S3).',
      'Maintain regular backups of the local storage directory (SQLite database and uploaded PDFs) to prevent data loss.',
    ],
  };
}

import { areSha256HashesEqual, toPrefixedSha256 } from './hash.ts';

/**
 * Verifies that arbitrary PDF bytes match the expected on-chain SHA-256 cryptographic hash.
 * Works in both browser (WebCrypto) and Node.js environments.
 */
export async function verifyPdfBytesHash(
  data: ArrayBuffer | Uint8Array,
  expectedHash: string
): Promise<{ matches: boolean; computedHash: string; valid: boolean; tamperWarning: boolean }> {
  let computedHash = '';

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const hashBuf = await crypto.subtle.digest('SHA-256', uint8 as unknown as BufferSource);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    computedHash = '0x' + hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Node.js fallback using crypto module
    const nodeCrypto = await import('crypto');
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
    computedHash = '0x' + nodeCrypto.createHash('sha256').update(buf).digest('hex');
  }

  const isMatch = areSha256HashesEqual(computedHash, expectedHash);

  return {
    matches: isMatch,
    valid: isMatch,
    tamperWarning: !isMatch,
    computedHash: toPrefixedSha256(computedHash),
  };
}
