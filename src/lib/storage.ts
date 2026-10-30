import type { 
  DocumentRecord, 
  SharedRecord, 
  ActivityEvent, 
  AuthorApplication, 
  AuthorizedAuthorRecord 
} from '../types';

const STORAGE_KEYS = {
  DOCUMENTS: 'notaryvault_documents_v1',
  SHARED: 'notaryvault_shared_v1',
  ACTIVITIES: 'notaryvault_activities_v1',
  APPLICATIONS: 'notaryvault_author_applications_v1',
  AUTHORS: 'notaryvault_authorized_authors_v1',
  BACKUP_PREFIX: 'notaryvault_backup_',
};

/**
 * Loads documents from localStorage with schema validation and fallback checks.
 */
export function loadDocuments(networkKey?: string): DocumentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
    let docs: DocumentRecord[] = raw ? JSON.parse(raw) : [];

    // Fallback: check network-specific backup if primary is empty
    if (docs.length === 0 && networkKey) {
      const backupRaw = localStorage.getItem(`${STORAGE_KEYS.BACKUP_PREFIX}docs_${networkKey}`);
      if (backupRaw) {
        docs = JSON.parse(backupRaw);
      }
    }

    if (!Array.isArray(docs)) return [];

    // Filter by network if specified
    if (networkKey) {
      return docs.filter(d => !d.networkKey || d.networkKey === networkKey);
    }
    return docs;
  } catch (e) {
    console.error('Error loading documents from localStorage', e);
    return [];
  }
}

/**
 * Saves documents to localStorage with automatic backup.
 */
export function saveDocuments(docs: DocumentRecord[]): void {
  try {
    if (!Array.isArray(docs)) return;
    localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));

    // Also persist per-network backups so switching networks or partial clears don't lose data
    const testnetDocs = docs.filter(d => !d.networkKey || d.networkKey === 'testnet');
    const mainnetDocs = docs.filter(d => d.networkKey === 'mainnet');

    if (testnetDocs.length > 0) {
      localStorage.setItem(`${STORAGE_KEYS.BACKUP_PREFIX}docs_testnet`, JSON.stringify(testnetDocs));
    }
    if (mainnetDocs.length > 0) {
      localStorage.setItem(`${STORAGE_KEYS.BACKUP_PREFIX}docs_mainnet`, JSON.stringify(mainnetDocs));
    }
  } catch (e) {
    console.error('Error saving documents to localStorage', e);
  }
}

/**
 * Merges local and recovered document records without data loss or duplicates.
 * Preserves user-provided titles, files, and notes while updating on-chain confirmation details.
 */
export function mergeDocuments(
  existingDocs: DocumentRecord[],
  incomingDocs: DocumentRecord[]
): DocumentRecord[] {
  const map = new Map<string, DocumentRecord>();

  // 1. Index existing documents
  for (const doc of existingDocs) {
    if (doc && doc.id) {
      map.set(doc.id.toUpperCase(), doc);
    }
  }

  // 2. Merge incoming documents
  for (const incoming of incomingDocs) {
    if (!incoming || !incoming.id) continue;
    const cleanId = incoming.id.toUpperCase();
    const existing = map.get(cleanId);

    if (existing) {
      // Merge: preserve local metadata, update verified on-chain data
      map.set(cleanId, {
        ...existing,
        ...incoming,
        name: existing.name || incoming.name,
        description: existing.description || incoming.description,
        fileName: existing.fileName !== `${incoming.id}.pdf` ? existing.fileName : incoming.fileName,
        fileSizeBytes: existing.fileSizeBytes > 0 ? existing.fileSizeBytes : incoming.fileSizeBytes,
        owner: existing.owner || incoming.owner,
        propertyId: existing.propertyId || incoming.propertyId,
        hasConflictWarning: existing.hasConflictWarning ?? incoming.hasConflictWarning,
        conflictNotes: existing.conflictNotes || incoming.conflictNotes,
        issueDate: existing.issueDate || incoming.issueDate,
        expiryDate: existing.expiryDate || incoming.expiryDate,
        // Ensure on-chain status is updated if incoming has confirmed on-chain data
        txHash: incoming.txHash || existing.txHash,
        blockNumber: incoming.blockNumber || existing.blockNumber,
        contractAddress: incoming.contractAddress || existing.contractAddress,
        networkChainId: incoming.networkChainId || existing.networkChainId,
        networkKey: incoming.networkKey || existing.networkKey,
        onChainStatus: incoming.onChainStatus || existing.onChainStatus,
        registrantAddress: incoming.registrantAddress || existing.registrantAddress,
        status: incoming.onChainStatus === 'revoked' ? 'Hash Mismatch' : (incoming.status || existing.status),
      });
    } else {
      map.set(cleanId, incoming);
    }
  }

  // Return sorted by registration date (newest first)
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.registeredAt || 0).getTime() - new Date(a.registeredAt || 0).getTime()
  );
}

export function loadSharedRecords(): SharedRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SHARED);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Error loading shared records', e);
    return [];
  }
}

export function saveSharedRecords(records: SharedRecord[]): void {
  try {
    if (!Array.isArray(records)) return;
    localStorage.setItem(STORAGE_KEYS.SHARED, JSON.stringify(records));
  } catch (e) {
    console.error('Error saving shared records', e);
  }
}

export function loadActivities(networkKey?: string): ActivityEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVITIES);
    let events: ActivityEvent[] = raw ? JSON.parse(raw) : [];

    if (events.length === 0 && networkKey) {
      const backupRaw = localStorage.getItem(`${STORAGE_KEYS.BACKUP_PREFIX}acts_${networkKey}`);
      if (backupRaw) {
        events = JSON.parse(backupRaw);
      }
    }

    return Array.isArray(events) ? events : [];
  } catch (e) {
    console.error('Error loading activities', e);
    return [];
  }
}

export function saveActivities(events: ActivityEvent[]): void {
  try {
    if (!Array.isArray(events)) return;
    localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(events));
  } catch (e) {
    console.error('Error saving activities', e);
  }
}

/**
 * Merges activity records while strictly preventing duplicate entries.
 * Deduplicates by unique activity ID, or by combination of (documentId + type + timestamp).
 */
export function mergeActivities(
  existingActivities: ActivityEvent[],
  incomingActivities: ActivityEvent[]
): ActivityEvent[] {
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const result: ActivityEvent[] = [];

  const addUnique = (act: ActivityEvent) => {
    if (!act || !act.id) return;
    if (seenIds.has(act.id)) return;

    // Secondary fingerprint: documentId + type + normalized timestamp/day
    const dateKey = act.timestamp ? act.timestamp.slice(0, 19) : '';
    const fingerprint = `${act.documentId || ''}|${act.type}|${dateKey}`;

    if (seenFingerprints.has(fingerprint)) return;

    seenIds.add(act.id);
    seenFingerprints.add(fingerprint);
    result.push(act);
  };

  // 1. Add existing
  for (const act of existingActivities) {
    addUnique(act);
  }

  // 2. Add incoming
  for (const act of incomingActivities) {
    addUnique(act);
  }

  // Sort newest first
  return result.sort(
    (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );
}

export function clearStoredData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.DOCUMENTS);
    localStorage.removeItem(STORAGE_KEYS.SHARED);
    localStorage.removeItem(STORAGE_KEYS.ACTIVITIES);
    localStorage.removeItem(STORAGE_KEYS.APPLICATIONS);
    localStorage.removeItem(STORAGE_KEYS.AUTHORS);
    localStorage.removeItem(`${STORAGE_KEYS.BACKUP_PREFIX}docs_testnet`);
    localStorage.removeItem(`${STORAGE_KEYS.BACKUP_PREFIX}docs_mainnet`);
    localStorage.removeItem(`${STORAGE_KEYS.BACKUP_PREFIX}acts_testnet`);
    localStorage.removeItem(`${STORAGE_KEYS.BACKUP_PREFIX}acts_mainnet`);
  } catch (e) {
    console.error('Error clearing stored data', e);
  }
}

export const resetDemoData = clearStoredData;

/**
 * Loads author applications from localStorage.
 */
export function loadAuthorApplications(): AuthorApplication[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.APPLICATIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves author applications to localStorage.
 */
export function saveAuthorApplications(apps: AuthorApplication[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
  } catch (e) {
    console.error('Error saving author applications', e);
  }
}

/**
 * Loads authorized authors from localStorage.
 */
export function loadAuthorizedAuthors(): AuthorizedAuthorRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUTHORS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves authorized authors to localStorage.
 */
export function saveAuthorizedAuthors(authors: AuthorizedAuthorRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.AUTHORS, JSON.stringify(authors));
  } catch (e) {
    console.error('Error saving authorized authors', e);
  }
}
