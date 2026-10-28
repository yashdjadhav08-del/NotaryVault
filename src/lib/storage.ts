import type { DocumentRecord, SharedRecord, ActivityEvent } from '../types';

const STORAGE_KEYS = {
  DOCUMENTS: 'notaryvault_documents_v1',
  SHARED: 'notaryvault_shared_v1',
  ACTIVITIES: 'notaryvault_activities_v1',
};

export function loadDocuments(): DocumentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading documents from localStorage', e);
    return [];
  }
}

export function saveDocuments(docs: DocumentRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));
  } catch (e) {
    console.error('Error saving documents to localStorage', e);
  }
}

export function loadSharedRecords(): SharedRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SHARED);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading shared records', e);
    return [];
  }
}

export function saveSharedRecords(records: SharedRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SHARED, JSON.stringify(records));
  } catch (e) {
    console.error('Error saving shared records', e);
  }
}

export function loadActivities(): ActivityEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVITIES);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading activities', e);
    return [];
  }
}

export function saveActivities(events: ActivityEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(events));
  } catch (e) {
    console.error('Error saving activities', e);
  }
}

export function clearStoredData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.DOCUMENTS);
    localStorage.removeItem(STORAGE_KEYS.SHARED);
    localStorage.removeItem(STORAGE_KEYS.ACTIVITIES);
  } catch (e) {
    console.error('Error clearing stored data', e);
  }
}

export const resetDemoData = clearStoredData;
