const DB_NAME = "portrait-atelier";
const STORE_NAME = "photographs";
const PHOTO_KEY = "current-pet-photo";

/**
 * Opens the browser database used for uploaded photographs.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () => {
      reject(request.error ?? new Error("Cannot open photograph storage."));
    };
  });
}

/**
 * Saves the original photograph in browser storage.
 */
export async function savePhoto(file: File): Promise<void> {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");

      transaction.objectStore(STORE_NAME).put(file, PHOTO_KEY);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Cannot save photograph."));
      };

      transaction.onabort = () => {
        reject(transaction.error ?? new Error("Photograph saving was cancelled."));
      };
    });
  } finally {
    database.close();
  }
}

/**
 * Restores the previously uploaded photograph.
 */
export async function loadPhoto(): Promise<File | null> {
  const database = await openDatabase();

  try {
    return await new Promise<File | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(PHOTO_KEY);

      request.onsuccess = () => {
        resolve(request.result instanceof File ? request.result : null);
      };

      request.onerror = () => {
        reject(request.error ?? new Error("Cannot restore photograph."));
      };
    });
  } finally {
    database.close();
  }
}
