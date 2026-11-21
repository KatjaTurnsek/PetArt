import { removeBackground } from "../services/backgroundRemoval";

/**
 * Full-size transparent cutout shared by Steps 2, 3 and 4.
 * IndexedDB survives refresh; in-flight promises prevent duplicate ONNX runs.
 * Keeps the original photograph unchanged.
 */
const DATABASE = "portrait-atelier";
const STORE = "photographs";
const PREFIX = "full-pet-cutout-v1:";
const running = new Map<string, Promise<Blob>>();

function keyFor(file: File): string {
  return PREFIX + JSON.stringify([file.name, file.size, file.lastModified, file.type]);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open cutout storage"));
  });
}

async function loadCached(key: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error("Could not read cutout"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Cutout read aborted"));
    });
  } finally {
    db.close();
  }
}

async function saveCached(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(blob, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save cutout"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Cutout write aborted"));
    });
  } finally {
    db.close();
  }
}

export function getPetCutoutBlob(file: File): Promise<Blob> {
  const key = keyFor(file);
  const existing = running.get(key);
  if (existing) return existing;

  const task = (async (): Promise<Blob> => {
    let saved: Blob | null = null;
    try { saved = await loadCached(key); } catch { /* Cache is optional. */ }
    if (saved && saved.size > 0) return saved;

    // Only one caller computes the segmentation. On success, persist the *full*
    // transparent image, not Step 3's cropped version (Step 4 needs alignment).
    const fresh = await removeBackground(file);
    if (fresh.size === 0) throw new Error("Background removal returned an empty image");
    try { await saveCached(key, fresh); } catch { /* Private mode / storage quota. */ }
    return fresh;
  })();

  running.set(key, task);
  // Failed tasks should be retryable; successful tasks remain in memory.
  void task.catch(() => {
    if (running.get(key) === task) running.delete(key);
  });
  return task;
}
