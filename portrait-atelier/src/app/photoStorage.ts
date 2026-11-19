import type { PortraitSubject } from "./atelierState";

const DB_NAME = "portrait-atelier";
const STORE_NAME = "photographs";
const PHOTO_KEY = "current-pet-photo";
const SUBJECTS_KEY = "portrait-subjects-v1";

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
    request.onerror = () => reject(request.error ?? new Error("Cannot open photograph storage."));
  });
}

async function writeRecord(key: string, value: File | PortraitSubject[] | null): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      if (value === null) store.delete(key);
      else store.put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Cannot save Atelier data."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Saving Atelier data was cancelled."));
    });
  } finally {
    database.close();
  }
}

async function readRecord(key: string): Promise<unknown> {
  const database = await openDatabase();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Cannot restore Atelier data."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Restoring Atelier data was cancelled."));
    });
  } finally {
    database.close();
  }
}

/** Compatibility API for the existing single-photo screens. */
export async function savePhoto(file: File): Promise<void> {
  await writeRecord(PHOTO_KEY, file);
}

export async function loadPhoto(): Promise<File | null> {
  const value = await readRecord(PHOTO_KEY);
  return value instanceof File ? value : null;
}

/** Remove the legacy photo when a customer removes the last pet. */
export async function deletePhoto(): Promise<void> {
  await writeRecord(PHOTO_KEY, null);
}

/** Save the photos and layout of all selected pets together. */
export async function savePortraitSubjects(subjects: PortraitSubject[]): Promise<void> {
  await writeRecord(SUBJECTS_KEY, subjects);
}

export async function loadPortraitSubjects(): Promise<PortraitSubject[]> {
  const value = await readRecord(SUBJECTS_KEY);
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    !value.every((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) return false;
      const subject = entry as Partial<PortraitSubject>;
      return (
        typeof subject.id === "string" &&
        typeof subject.name === "string" &&
        subject.photo instanceof File &&
        Array.isArray(subject.referencePhotos) &&
        subject.referencePhotos.every((photo) => photo instanceof File) &&
        typeof subject.position?.x === "number" &&
        typeof subject.position?.y === "number" &&
        typeof subject.scale === "number" &&
        typeof subject.rotation === "number" &&
        typeof subject.layer === "number"
      );
    })
  ) {
    throw new Error("Saved portrait subjects are invalid.");
  }
  return value as PortraitSubject[];
}
