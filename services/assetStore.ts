/**
 * Asset Store - Blob-based image storage for performance
 *
 * Stores images as Blobs in IndexedDB instead of Base64 strings in React state.
 * This reduces memory usage and speeds up saves since layer metadata stays small.
 */

const DB_NAME = 'gemini-canvas-assets';
const DB_VERSION = 1;
const ASSETS_STORE = 'assets';

interface AssetRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: number;
}

let dbInstance: IDBDatabase | null = null;

// Runtime cache of blob URLs to avoid recreating them
// Using Map for insertion-order iteration (enables LRU eviction)
const blobUrlCache = new Map<string, string>();
const MAX_BLOB_CACHE_SIZE = 50;

function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        db.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Convert a Base64 data URL to a Blob
 */
function base64ToBlob(base64: string): Blob {
  // Handle data URL format: "data:image/png;base64,..."
  const [header, data] = base64.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

  const byteString = atob(data);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  return new Blob([arrayBuffer], { type: mimeType });
}

/**
 * Store a Base64 image and return its ID
 */
export async function storeAsset(base64: string): Promise<string> {
  const id = crypto.randomUUID();
  const blob = base64ToBlob(base64);

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    const store = tx.objectStore(ASSETS_STORE);

    const record: AssetRecord = {
      id,
      blob,
      mimeType: blob.type,
      size: blob.size,
      createdAt: Date.now()
    };

    store.put(record);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get a blob URL for an asset ID (cached for performance)
 */
export async function getAssetUrl(id: string): Promise<string | null> {
  // Check cache first
  if (blobUrlCache.has(id)) {
    return blobUrlCache.get(id)!;
  }

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readonly');
    const store = tx.objectStore(ASSETS_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as AssetRecord | undefined;
      if (!record) {
        resolve(null);
        return;
      }

      // LRU eviction: if cache is full, revoke and remove oldest entry
      if (blobUrlCache.size >= MAX_BLOB_CACHE_SIZE) {
        const oldestKey = blobUrlCache.keys().next().value;
        if (oldestKey) {
          const oldUrl = blobUrlCache.get(oldestKey);
          if (oldUrl) URL.revokeObjectURL(oldUrl);
          blobUrlCache.delete(oldestKey);
        }
      }

      const url = URL.createObjectURL(record.blob);
      blobUrlCache.set(id, url);
      resolve(url);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the raw blob for an asset (for re-encoding, etc.)
 */
export async function getAssetBlob(id: string): Promise<Blob | null> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readonly');
    const store = tx.objectStore(ASSETS_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as AssetRecord | undefined;
      resolve(record?.blob ?? null);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Convert an asset back to Base64 (for API calls that need Base64)
 */
export async function getAssetBase64(id: string): Promise<string | null> {
  const blob = await getAssetBlob(id);
  if (!blob) return null;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Delete an asset and revoke its blob URL
 */
export async function deleteAsset(id: string): Promise<void> {
  // Revoke cached blob URL
  const cachedUrl = blobUrlCache.get(id);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    blobUrlCache.delete(id);
  }

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    const store = tx.objectStore(ASSETS_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Delete multiple assets at once
 */
export async function deleteAssets(ids: string[]): Promise<void> {
  // Revoke all cached blob URLs
  for (const id of ids) {
    const cachedUrl = blobUrlCache.get(id);
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl);
      blobUrlCache.delete(id);
    }
  }

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    const store = tx.objectStore(ASSETS_STORE);

    for (const id of ids) {
      store.delete(id);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Preload blob URLs for a list of asset IDs (call on app load)
 */
export async function preloadAssetUrls(ids: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  await Promise.all(
    ids.map(async (id) => {
      const url = await getAssetUrl(id);
      if (url) {
        results.set(id, url);
      }
    })
  );

  return results;
}

/**
 * Clear all assets and revoke all blob URLs
 */
export async function clearAllAssets(): Promise<void> {
  // Revoke all cached blob URLs
  for (const url of blobUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  blobUrlCache.clear();

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    const store = tx.objectStore(ASSETS_STORE);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all asset IDs in the store
 */
export async function getAllAssetIds(): Promise<string[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readonly');
    const store = tx.objectStore(ASSETS_STORE);
    const request = store.getAllKeys();

    request.onsuccess = () => resolve(request.result as string[]);
    request.onerror = () => reject(request.error);
  });
}
