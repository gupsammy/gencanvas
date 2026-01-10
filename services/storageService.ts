import { LayerData } from '../types';
import { generateThumbnail } from './thumbnailService';
import { storeAsset, getAssetUrl } from './assetStore';

const DB_NAME = 'gemini-canvas-db';
const DB_VERSION = 2;
const LAYERS_STORE = 'layers';
const STATE_STORE = 'canvasState';

const MAX_HISTORY_STATES = 20;

let dbInstance: IDBDatabase | null = null;

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
      if (!db.objectStoreNames.contains(LAYERS_STORE)) {
        db.createObjectStore(LAYERS_STORE);
      }
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE);
      }
    };
  });
}

export async function saveLayers(layers: LayerData[]): Promise<void> {
  try {
    const db = await initDB();
    // Strip blob URLs when asset IDs exist (blob URLs are runtime-only)
    const layersForStorage = layers.map(layer => {
      if (layer.imageId || layer.thumbnailId) {
        const { src, thumbnail, ...rest } = layer;
        return {
          ...rest,
          // Keep src empty or as placeholder when using asset store
          src: layer.imageId ? '' : src,
          thumbnail: layer.thumbnailId ? undefined : thumbnail,
        } as LayerData;
      }
      return layer;
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LAYERS_STORE, 'readwrite');
      const store = tx.objectStore(LAYERS_STORE);
      store.put(layersForStorage, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Failed to save layers:', error);
  }
}

export async function loadLayers(): Promise<LayerData[] | null> {
  try {
    const db = await initDB();
    const layers = await new Promise<LayerData[] | null>((resolve, reject) => {
      const tx = db.transaction(LAYERS_STORE, 'readonly');
      const store = tx.objectStore(LAYERS_STORE);
      const request = store.get('current');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    if (!layers) return null;

    // Process layers: resolve asset IDs and migrate old inline Base64
    let needsSave = false;
    const processedLayers = await Promise.all(
      layers.map(async (layer) => {
        let updated = { ...layer };

        // Resolve asset IDs to blob URLs
        if (layer.imageId) {
          try {
            const url = await getAssetUrl(layer.imageId);
            if (url) updated.src = url;
          } catch (e) {
            console.warn('Failed to load asset for layer', layer.id, e);
          }
        }
        if (layer.thumbnailId) {
          try {
            const url = await getAssetUrl(layer.thumbnailId);
            if (url) updated.thumbnail = url;
          } catch (e) {
            console.warn('Failed to load thumbnail asset for layer', layer.id, e);
          }
        }

        // Migrate old layers with inline Base64 to asset store
        if (layer.type === 'image' && layer.src && !layer.imageId && layer.src.startsWith('data:')) {
          try {
            // Generate thumbnail if missing
            let thumbnailBase64 = layer.thumbnail;
            if (!thumbnailBase64) {
              thumbnailBase64 = await generateThumbnail(layer.src);
            }
            // Store in asset store
            const [imageId, thumbnailId] = await Promise.all([
              storeAsset(layer.src),
              thumbnailBase64 ? storeAsset(thumbnailBase64) : Promise.resolve(undefined)
            ]);
            // Get blob URLs
            const [imageUrl, thumbUrl] = await Promise.all([
              getAssetUrl(imageId),
              thumbnailId ? getAssetUrl(thumbnailId) : Promise.resolve(undefined)
            ]);
            updated = {
              ...updated,
              imageId,
              thumbnailId,
              src: imageUrl || layer.src,
              thumbnail: thumbUrl || thumbnailBase64
            };
            needsSave = true;
          } catch (e) {
            console.warn('Failed to migrate layer to asset store', layer.id, e);
            // Fallback: at least generate thumbnail if missing
            if (!layer.thumbnail && layer.src) {
              try {
                updated.thumbnail = await generateThumbnail(layer.src);
                needsSave = true;
              } catch (e2) {
                console.warn('Thumbnail generation also failed', e2);
              }
            }
          }
        }

        return updated;
      })
    );

    // Save migrated layers back if any were updated
    if (needsSave) {
      await saveLayers(processedLayers);
    }

    return processedLayers;
  } catch (error) {
    console.error('Failed to load layers:', error);
    return null;
  }
}

export async function saveViewState(
  offset: { x: number; y: number },
  scale: number
): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STATE_STORE, 'readwrite');
      const store = tx.objectStore(STATE_STORE);
      store.put({ offset, scale }, 'viewState');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Failed to save view state:', error);
  }
}

export async function loadViewState(): Promise<{
  offset: { x: number; y: number };
  scale: number;
} | null> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STATE_STORE, 'readonly');
      const store = tx.objectStore(STATE_STORE);
      const request = store.get('viewState');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to load view state:', error);
    return null;
  }
}

// Helper to strip blob URLs for storage
function stripBlobUrlsFromLayer(layer: LayerData): LayerData {
  if (layer.imageId || layer.thumbnailId) {
    const { src, thumbnail, ...rest } = layer;
    return {
      ...rest,
      src: layer.imageId ? '' : src,
      thumbnail: layer.thumbnailId ? undefined : thumbnail,
    } as LayerData;
  }
  return layer;
}

export async function saveHistory(
  history: LayerData[][],
  historyIndex: number
): Promise<void> {
  try {
    const db = await initDB();
    // Limit history to last MAX_HISTORY_STATES states to prevent unbounded growth
    const trimmedHistory = history.slice(-MAX_HISTORY_STATES);
    const adjustedIndex = Math.max(0, historyIndex - (history.length - trimmedHistory.length));

    // Strip blob URLs from history to keep storage small
    const historyForStorage = trimmedHistory.map(layers =>
      layers.map(stripBlobUrlsFromLayer)
    );

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STATE_STORE, 'readwrite');
      const store = tx.objectStore(STATE_STORE);
      store.put({ history: historyForStorage, index: adjustedIndex }, 'history');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

export async function loadHistory(): Promise<{
  history: LayerData[][];
  index: number;
} | null> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STATE_STORE, 'readonly');
      const store = tx.objectStore(STATE_STORE);
      const request = store.get('history');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to load history:', error);
    return null;
  }
}

export async function clearAllData(): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([LAYERS_STORE, STATE_STORE], 'readwrite');
      tx.objectStore(LAYERS_STORE).clear();
      tx.objectStore(STATE_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Failed to clear data:', error);
  }
}

/**
 * Emergency clear - deletes ALL IndexedDB databases for this app
 * Call from browser console: window.emergencyClear()
 */
export async function emergencyClearAll(): Promise<void> {
  console.log('Emergency clear: Deleting all databases...');
  try {
    // Delete the main storage database
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('gemini-canvas-db');
      req.onsuccess = () => { console.log('Deleted gemini-canvas-db'); resolve(); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => { console.warn('Database deletion blocked - close other tabs'); resolve(); };
    });
    // Delete the assets database
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('gemini-canvas-assets');
      req.onsuccess = () => { console.log('Deleted gemini-canvas-assets'); resolve(); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => { console.warn('Assets database deletion blocked'); resolve(); };
    });
    console.log('Emergency clear complete. Refresh the page.');
  } catch (e) {
    console.error('Emergency clear failed:', e);
  }
}
