/** Persist canvas dimensions and Step 4 selections without storing image files in localStorage. */
import type { AtelierState } from "./atelierState";

const CANVAS_KEY = "portrait-atelier-canvas-v1";
const DB_NAME = "portrait-atelier";
const STORE_NAME = "photographs";
const BACKGROUND_KEY = "background-selection-v1";

export interface SavedBackgroundSelection {
  preference: "original" | "softened" | "neutral" | "personal";
  tone: "ivory" | "stone" | "sage" | "umber" | "blue";
  photo: File | null;
  notes: string;
}

export interface SavedCanvasSelection {
  shape: AtelierState["canvas"]["shape"];
  sizeId: string | null;
  width: number | null;
  height: number | null;
  customWidth: number;
  customHeight: number;
}

function isDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= 25 && value <= 200 && value % 5 === 0;
}

export function saveCanvasSelection(value: SavedCanvasSelection): void {
  try {
    localStorage.setItem(CANVAS_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Canvas selection could not be saved.", error);
  }
}

export function loadCanvasSelection(): SavedCanvasSelection | null {
  try {
    const raw = localStorage.getItem(CANVAS_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const c = value as Partial<SavedCanvasSelection>;
    if (c.shape !== "portrait" && c.shape !== "landscape" && c.shape !== "square") return null;
    if (c.sizeId !== null && typeof c.sizeId !== "string") return null;
    if (!isDimension(c.customWidth) || !isDimension(c.customHeight)) return null;
    if (c.width !== null && !isDimension(c.width)) return null;
    if (c.height !== null && !isDimension(c.height)) return null;
    return c as SavedCanvasSelection;
  } catch (error) {
    console.warn("Canvas selection could not be restored.", error);
    return null;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Reuse the existing photographs object store and version; no migration needed.
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open Atelier storage."));
  });
}

export async function saveBackgroundSelection(value: SavedBackgroundSelection): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, BACKGROUND_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save background."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Background save was cancelled."));
    });
  } finally {
    database.close();
  }
}

export async function loadBackgroundSelection(): Promise<SavedBackgroundSelection | null> {
  const database = await openDatabase();
  try {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(BACKGROUND_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not restore background."));
    });
    if (typeof raw !== "object" || raw === null) return null;
    const value = raw as Partial<SavedBackgroundSelection>;
    const preferences = ["original", "softened", "neutral", "personal"];
    const tones = ["ivory", "stone", "sage", "umber", "blue"];
    if (!value.preference || !preferences.includes(value.preference) ||
        !value.tone || !tones.includes(value.tone) ||
        typeof value.notes !== "string" ||
        !(value.photo === null || value.photo instanceof File)) return null;
    return value as SavedBackgroundSelection;
  } finally {
    database.close();
  }
}
