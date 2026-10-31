import type { 
  DocumentRecord, 
  SharedRecord, 
  ActivityEvent, 
  AuthorApplication, 
  AuthorizedAuthorRecord 
} from '../types';

export type SupportedNetworkKey = 'testnet' | 'mainnet';

export function normalizeNetworkKey(networkKey?: string): SupportedNetworkKey {
  return networkKey?.toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet';
}

const STORAGE_KEYS = {
  LEGACY_DOCUMENTS: 'notaryvault_documents_v1',
  LEGACY_SHARED: 'notaryvault_shared_v1',
  LEGACY_ACTIVITIES: 'notaryvault_activities_v1',
  LEGACY_APPLICATIONS: 'notaryvault_author_applications_v1',
  LEGACY_AUTHORS: 'notaryvault_authorized_authors_v1',
  DOCUMENTS_PREFIX: 'notaryvault_documents_',
  SHARED_PREFIX: 'notaryvault_shared_',
  ACTIVITIES_PREFIX: 'notaryvault_activities_',
  APPLICATIONS_PREFIX: 'notaryvault_applications_',
  AUTHORS_PREFIX: 'notaryvault_authors_',
  BACKUP_PREFIX: 'notaryvault_backup_',
};

/**
 * Returns the network-partitioned storage key.
 */
export function getStorageKeyForNetwork(prefix: string, networkKey?: string): string {
  const net = normalizeNetworkKey(networkKey);
  return `${prefix}${net}`;
}

/**
 * Loads documents from localStorage with strict network partitioning and schema validation.
 */
export function loadDocuments(networkKey?: string): DocumentRecord[] {
  try {
    const net = normalizeNetworkKey(networkKey);
    const key = getStorageKeyForNetwork(STORAGE_KEYS.DOCUMENTS_PREFIX, net);
    const raw = localStorage.getItem(key);

    let docs: DocumentRecord[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) docs = parsed;
      } catch {}
    }

    // Backward-compatibility fallback:
    if (docs.length === 0) {
      if (net === 'testnet') {
        // Check legacy single-bucket storage
        const legacyRaw = localStorage.getItem(STORAGE_KEYS.LEGACY_DOCUMENTS);
        if (legacyRaw) {
          try {
            const legacyParsed = JSON.parse(legacyRaw);
            if (Array.isArray(legacyParsed)) {
              docs = legacyParsed.filter(d => !d.networkKey || d.networkKey === 'testnet');
            }
          } catch {}
        }
        // Check backup
        if (docs.length === 0) {
          const backupRaw = localStorage.getItem(`${STORAGE_KEYS.BACKUP_PREFIX}docs_testnet`);
          if (backupRaw) {
            try {
              const bParsed = JSON.parse(backupRaw);
              if (Array.isArray(bParsed)) docs = bParsed;
            } catch {}
          }
        }
      } else if (net === 'mainnet') {
        const backupRaw = localStorage.getItem(`${STORAGE_KEYS.BACKUP_PREFIX}docs_mainnet`);
        if (backupRaw) {
          try {
            const bParsed = JSON.parse(backupRaw);
            if (Array.isArray(bParsed)) docs = bParsed;
          } catch {}
        }
      }
    }

    if (!Array.isArray(docs)) return [];

    // Strictly enforce that returned documents match the requested network
    return docs
      .filter(d => (d.networkKey || 'testnet').toLowerCase() === net)
      .map(d => ({ ...d, networkKey: net }));
  } catch (e) {
    console.error('Error loading documents from localStorage', e);
    return [];
  }
}

/**
 * Saves documents to localStorage partitioned strictly by network.
 */
export function saveDocuments(docs: DocumentRecord[], networkKey?: string): void {
  try {
    if (!Array.isArray(docs)) return;
    const net = normalizeNetworkKey(networkKey);
    const key = getStorageKeyForNetwork(STORAGE_KEYS.DOCUMENTS_PREFIX, net);

    // Save only documents belonging to this network
    const networkDocs = docs.filter(d => (d.networkKey || 'testnet').toLowerCase() === net);
    localStorage.setItem(key, JSON.stringify(networkDocs));

    // Also persist per-network backup
    localStorage.setItem(`${STORAGE_KEYS.BACKUP_PREFIX}docs_${net}`, JSON.stringify(networkDocs));
  } catch (e) {
    console.error('Error saving documents to localStorage', e);
  }
}

/**
 * Merges local and recovered document records without cross-network data leakage.
 * Uses a composite key `${networkKey}:${docId}` so the same Document ID can exist
 * independently on Testnet and Mainnet without overwriting each other.
 */
export function mergeDocuments(
  existingDocs: DocumentRecord[],
  incomingDocs: DocumentRecord[]
): DocumentRecord[] {
  const map = new Map<string, DocumentRecord>();

  // Helper to build composite deduplication key
  const getCompositeKey = (doc: DocumentRecord) => {
    const net = (doc.networkKey || 'testnet').toLowerCase();
    const id = doc.id ? doc.id.trim().toUpperCase() : '';
    return `${net}:${id}`;
  };

  // 1. Index existing documents
  for (const doc of existingDocs) {
    if (doc && doc.id) {
      map.set(getCompositeKey(doc), doc);
    }
  }

  // 2. Merge incoming documents
  for (const incoming of incomingDocs) {
    if (!incoming || !incoming.id) continue;
    const key = getCompositeKey(incoming);
    const existing = map.get(key);

    if (existing) {
      // Merge: preserve local metadata, update verified on-chain data
      map.set(key, {
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
        networkName: incoming.networkName || existing.networkName,
        onChainStatus: incoming.onChainStatus || existing.onChainStatus,
        registrantAddress: incoming.registrantAddress || existing.registrantAddress,
        status: incoming.onChainStatus === 'revoked' ? 'Hash Mismatch' : (incoming.status || existing.status),
      });
    } else {
      map.set(key, incoming);
    }
  }

  // Return sorted by registration date (newest first)
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.registeredAt || 0).getTime() - new Date(a.registeredAt || 0).getTime()
  );
}

export function loadSharedRecords(networkKey?: string): SharedRecord[] {
  try {
    const net = normalizeNetworkKey(networkKey);
    const key = getStorageKeyForNetwork(STORAGE_KEYS.SHARED_PREFIX, net);
    let raw = localStorage.getItem(key);

    if (!raw && net === 'testnet') {
      raw = localStorage.getItem(STORAGE_KEYS.LEGACY_SHARED);
    }

    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(r => !r.networkKey || (r.networkKey as string).toLowerCase() === net)
      .map(r => ({ ...r, networkKey: net }));
  } catch (e) {
    console.error('Error loading shared records', e);
    return [];
  }
}

export function saveSharedRecords(records: SharedRecord[], networkKey?: string): void {
  try {
    if (!Array.isArray(records)) return;
    const net = normalizeNetworkKey(networkKey);
    const key = getStorageKeyForNetwork(STORAGE_KEYS.SHARED_PREFIX, net);
    const networkRecords = records.filter(r => !r.networkKey || (r.networkKey as string).toLowerCase() === net);
    localStorage.setItem(key, JSON.stringify(networkRecords));
  } catch (e) {
    console.error('Error saving shared records', e);
  }
}

export function loadActivities(networkKey?: string): ActivityEvent[] {
  try {
    const net = normalizeNetworkKey(networkKey);
    const key = getStorageKeyForNetwork(STORAGE_KEYS.ACTIVITIES_PREFIX, net);
    let raw = localStorage.getItem(key);

    let events: ActivityEvent[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) events = parsed;
      } catch {}
    }

    if (events.length === 0) {
      if (net === 'testnet') {
        const legacyRaw = localStorage.getItem(STORAGE_KEYS.LEGACY_ACTIVITIES);
        if (legacyRaw) {
          try {
            const parsed = JSON.parse(legacyRaw);
            if (Array.isArray(parsed)) {
              events = parsed.filter(a => !a.networkKey || a.networkKey === 'testnet');
            }
          } catch {}
        }
        if (events.length === 0) {
          const backupRaw = localStorage.getItem(`${STORAGE_KEYS.BACKUP_PREFIX}acts_testnet`);
          if (backupRaw) {
            try {
              const bParsed = JSON.parse(backupRaw);
              if (Array.isArray(bParsed)) events = bParsed;
            } catch {}
          }
        }
      } else if (net === 'mainnet') {
        const backupRaw = localStorage.getItem(`${STORAGE_KEYS.BACKUP_PREFIX}acts_mainnet`);
        if (backupRaw) {
          try {
            const bParsed = JSON.parse(backupRaw);
            if (Array.isArray(bParsed)) events = bParsed;
          } catch {}
        }
      }
    }

    return events
      .filter(a => !a.networkKey || (a.networkKey as string).toLowerCase() === net)
      .map(a => ({ ...a, networkKey: net }));
  } catch (e) {
    console.error('Error loading activities', e);
    return [];
  }
}

export function saveActivities(events: ActivityEvent[], networkKey?: string): void {
  try {
    if (!Array.isArray(events)) return;
    const net = normalizeNetworkKey(networkKey);
    const key = getStorageKeyForNetwork(STORAGE_KEYS.ACTIVITIES_PREFIX, net);
    const networkEvents = events.filter(a => !a.networkKey || (a.networkKey as string).toLowerCase() === net);
    localStorage.setItem(key, JSON.stringify(networkEvents));

    // Also persist per-network backup
    localStorage.setItem(`${STORAGE_KEYS.BACKUP_PREFIX}acts_${net}`, JSON.stringify(networkEvents));
  } catch (e) {
    console.error('Error saving activities', e);
  }
}

/**
 * Merges activity records while strictly preventing duplicate entries and cross-network mixing.
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
    const net = (act.networkKey || 'testnet').toLowerCase();
    const idKey = `${net}:${act.id}`;
    if (seenIds.has(idKey)) return;

    // Secondary fingerprint: network + documentId + type + normalized timestamp
    const dateKey = act.timestamp ? act.timestamp.slice(0, 19) : '';
    const fingerprint = `${net}|${act.documentId || ''}|${act.type}|${dateKey}`;

    if (seenFingerprints.has(fingerprint)) return;

    seenIds.add(idKey);
    seenFingerprints.add(fingerprint);
    result.push({ ...act, networkKey: net as SupportedNetworkKey });
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

export function clearStoredData(networkKey?: string): void {
  try {
    if (networkKey) {
      const net = normalizeNetworkKey(networkKey);
      localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.DOCUMENTS_PREFIX, net));
      localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.SHARED_PREFIX, net));
      localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.ACTIVITIES_PREFIX, net));
      localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.APPLICATIONS_PREFIX, net));
      localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.AUTHORS_PREFIX, net));
      localStorage.removeItem(`${STORAGE_KEYS.BACKUP_PREFIX}docs_${net}`);
      localStorage.removeItem(`${STORAGE_KEYS.BACKUP_PREFIX}acts_${net}`);
    } else {
      localStorage.removeItem(STORAGE_KEYS.LEGACY_DOCUMENTS);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_SHARED);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_ACTIVITIES);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_APPLICATIONS);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_AUTHORS);
      for (const net of ['testnet', 'mainnet'] as const) {
        localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.DOCUMENTS_PREFIX, net));
        localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.SHARED_PREFIX, net));
        localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.ACTIVITIES_PREFIX, net));
        localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.APPLICATIONS_PREFIX, net));
        localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.AUTHORS_PREFIX, net));
        localStorage.removeItem(`${STORAGE_KEYS.BACKUP_PREFIX}docs_${net}`);
        localStorage.removeItem(`${STORAGE_KEYS.BACKUP_PREFIX}acts_${net}`);
      }
    }
  } catch (e) {
    console.error('Error clearing stored data', e);
  }
}

export const resetDemoData = clearStoredData;

/**
 * Loads author applications from localStorage partitioned by network.
 */
export function loadAuthorApplications(networkKey?: string): AuthorApplication[] {
  try {
    const net = normalizeNetworkKey(networkKey);
    const key = getStorageKeyForNetwork(STORAGE_KEYS.APPLICATIONS_PREFIX, net);
    let raw = localStorage.getItem(key);

    if (!raw && net === 'testnet') {
      raw = localStorage.getItem(STORAGE_KEYS.LEGACY_APPLICATIONS);
    }

    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(a => !a.networkKey || (a.networkKey as string).toLowerCase() === net)
      .map(a => ({ ...a, networkKey: net }));
  } catch {
    return [];
  }
}

/**
 * Saves author applications to localStorage partitioned by network.
 */
export function saveAuthorApplications(apps: AuthorApplication[], networkKey?: string): void {
  try {
    const net = normalizeNetworkKey(networkKey);
    const key = getStorageKeyForNetwork(STORAGE_KEYS.APPLICATIONS_PREFIX, net);
    const networkApps = apps.filter(a => !a.networkKey || (a.networkKey as string).toLowerCase() === net);
    localStorage.setItem(key, JSON.stringify(networkApps));
  } catch (e) {
    console.error('Error saving author applications', e);
  }
}

/**
 * Loads authorized authors from localStorage partitioned by network.
 */
export function loadAuthorizedAuthors(networkKey?: string): AuthorizedAuthorRecord[] {
  try {
    const net = normalizeNetworkKey(networkKey);
    const key = getStorageKeyForNetwork(STORAGE_KEYS.AUTHORS_PREFIX, net);
    let raw = localStorage.getItem(key);

    if (!raw && net === 'testnet') {
      raw = localStorage.getItem(STORAGE_KEYS.LEGACY_AUTHORS);
    }

    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(a => !a.networkKey || (a.networkKey as string).toLowerCase() === net)
      .map(a => ({ ...a, networkKey: net }));
  } catch {
    return [];
  }
}

/**
 * Saves authorized authors to localStorage partitioned by network.
 */
export function saveAuthorizedAuthors(authors: AuthorizedAuthorRecord[], networkKey?: string): void {
  try {
    const net = normalizeNetworkKey(networkKey);
    const key = getStorageKeyForNetwork(STORAGE_KEYS.AUTHORS_PREFIX, net);
    const networkAuthors = authors.filter(a => !a.networkKey || (a.networkKey as string).toLowerCase() === net);
    localStorage.setItem(key, JSON.stringify(networkAuthors));
  } catch (e) {
    console.error('Error saving authorized authors', e);
  }
}

/**
 * Clears all stored records for a specific network.
 */
export function clearNetworkRecords(networkKey?: string): void {
  try {
    const net = normalizeNetworkKey(networkKey);
    localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.DOCUMENTS_PREFIX, net));
    localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.SHARED_PREFIX, net));
    localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.ACTIVITIES_PREFIX, net));
    localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.APPLICATIONS_PREFIX, net));
    localStorage.removeItem(getStorageKeyForNetwork(STORAGE_KEYS.AUTHORS_PREFIX, net));
    if (net === 'testnet') {
      localStorage.removeItem(STORAGE_KEYS.LEGACY_DOCUMENTS);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_SHARED);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_ACTIVITIES);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_APPLICATIONS);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_AUTHORS);
    }
  } catch (e) {
    console.error('Error clearing network records', e);
  }
}
