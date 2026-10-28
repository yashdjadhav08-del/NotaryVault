/**
 * Computes a genuine SHA-256 hash using the Web Cryptography API (crypto.subtle)
 * All hashing is executed locally in the browser; files are never uploaded.
 */
export async function computeFileSHA256(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexString = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hexString;
}

export async function computeStringSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function truncateHash(hash: string, startChars = 8, endChars = 8): string {
  if (!hash) return '';
  if (hash.length <= startChars + endChars) return hash;
  return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
}

/**
 * Converts a 32-byte SHA-256 hex digest into a standard EVM bytes32 string (0x-prefixed, 66 chars).
 * Handles:
 * - With or without 0x prefix
 * - Mixed case, uppercase, or lowercase hex
 * - Validates exactly 32 bytes (64 hex characters)
 * - Validates strict hex characters [0-9a-fA-F]
 * - Validates non-zero hash
 * 
 * NEVER re-hashes the digest! Preserves the exact original 32-byte value.
 */
export function hashToBytes32(hash: string): string {
  if (!hash || typeof hash !== 'string') {
    throw new Error('Hash must be a non-empty string');
  }

  const clean = hash.trim().startsWith('0x') ? hash.trim().slice(2) : hash.trim();

  if (clean.length !== 64) {
    throw new Error(`Invalid hash length: expected 64 hex characters (32 bytes), received ${clean.length}`);
  }

  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error('Invalid hash: contains non-hexadecimal characters');
  }

  const lower = clean.toLowerCase();
  if (lower === '0000000000000000000000000000000000000000000000000000000000000000') {
    throw new Error('Zero hash is not permitted');
  }

  return `0x${lower}`;
}

/**
 * Converts an EVM bytes32 string back to a clean 64-char lowercase hex digest without 0x prefix.
 */
export function bytes32ToHash(bytes32Str: string): string {
  if (!bytes32Str || typeof bytes32Str !== 'string') {
    throw new Error('bytes32 must be a non-empty string');
  }
  const clean = bytes32Str.trim().startsWith('0x') ? bytes32Str.trim().slice(2) : bytes32Str.trim();
  if (clean.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error('Invalid bytes32 string format');
  }
  return clean.toLowerCase();
}
