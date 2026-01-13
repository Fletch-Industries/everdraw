import { Layer, WetMixSettings } from '@/types/drawing';
import { CanvasSize } from '@/types/canvasSize';
import { ReferenceImage } from '@/types/drawing';

const DB_NAME = 'everdraw-autosave';
const DB_VERSION = 1;
const STORE_NAME = 'canvas-state';
const STATE_KEY = 'current';

export interface AutoSaveState {
  layers: Layer[];
  canvasSize: CanvasSize;
  backgroundColor: string;
  activeLayerId: string;
  wetMix: WetMixSettings;
  referenceImages: ReferenceImage[];
  timestamp: number;
}

let db: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
  });
};

export const saveDrawing = async (state: AutoSaveState): Promise<void> => {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.put(state, STATE_KEY);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to save drawing'));
    });
  } catch (error) {
    console.error('Auto-save failed:', error);
    throw error;
  }
};

export const loadDrawing = async (): Promise<AutoSaveState | null> => {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.get(STATE_KEY);
      
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(new Error('Failed to load drawing'));
    });
  } catch (error) {
    console.error('Auto-load failed:', error);
    return null;
  }
};

export const clearDrawing = async (): Promise<void> => {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.delete(STATE_KEY);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear drawing'));
    });
  } catch (error) {
    console.error('Clear auto-save failed:', error);
    throw error;
  }
};

export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  
  return date.toLocaleDateString();
};
