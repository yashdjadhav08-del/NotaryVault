/**
 * Normalizes a Document ID to canonical uppercase, trimmed format.
 * Guarantees consistent hashing and lookup across frontend, local storage, and smart contracts.
 */
export function normalizeDocumentId(docId: string): string {
  if (!docId) return '';
  return docId.trim().toUpperCase();
}

/**
 * Validates whether a Document ID string conforms to the NotaryVault canonical naming policy.
 * Must be 3-64 characters long and contain only uppercase alphanumeric characters, hyphens, and underscores.
 */
export function isValidDocumentId(docId: string): { valid: boolean; error?: string } {
  if (!docId || typeof docId !== 'string') {
    return { valid: false, error: 'Document ID cannot be empty.' };
  }
  const normalized = normalizeDocumentId(docId);
  if (normalized.length < 3) {
    return { valid: false, error: 'Document ID must be at least 3 characters long.' };
  }
  if (normalized.length > 64) {
    return { valid: false, error: 'Document ID cannot exceed 64 characters.' };
  }
  if (!/^[A-Z0-9_-]+$/.test(normalized)) {
    return { valid: false, error: 'Document ID can only contain letters, numbers, hyphens, and underscores.' };
  }
  return { valid: true };
}

/**
 * Generates a candidate Document ID conforming to the standard NV-YYYY-NNNNNN convention.
 */
export function generateDocumentId(): string {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `NV-${year}-${randomNum}`;
}

/**
 * Generates a collision-resistant unique Document ID by testing candidates against a uniqueness checker.
 * Handles collisions gracefully by generating fresh candidates until an available ID is found.
 */
export async function generateUniqueDocumentId(
  isTakenFn: (candidateId: string) => Promise<boolean> | boolean,
  maxRetries = 20
): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const candidate = `NV-${year}-${randomNum}`;
    const taken = await isTakenFn(candidate);
    if (!taken) {
      return candidate;
    }
  }
  // High-entropy fallback if 20 sequential collisions happen
  const highEntropyNum = Math.floor(10000000 + Math.random() * 90000000);
  return `NV-${year}-${highEntropyNum}`;
}

export function generateApplicationId(): string {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `APP-${year}-${randomNum}`;
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

