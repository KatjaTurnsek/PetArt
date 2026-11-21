import { getPetCutoutBlob } from "./petCutoutCache";
import { atelierState } from "./atelierState";
import type { PortraitSubject } from "./atelierState";
import { drawGroundShadow, hasGroundShadow } from "./groundShadow";

const BASE_HEIGHT = 0.56;
const CACHE_VERSION = "birefnet-lite-feather-v2";

// Set to 0 to compare with BiRefNet’s original, unfeathered edge.
const EDGE_FEATHER_PX = 0.8;
const DB_NAME = "portrait-atelier";
const STORE_NAME = "photographs";

type Cutout = { file: File; image: HTMLCanvasElement };
type Pending = { file: File; promise: Promise<HTMLCanvasElement> };
type StoredCutout = { signature: string; blob: Blob };

const cache = new Map<string, Cutout>();
const pending = new Map<string, Pending>();

// Process photographs one at a time to avoid overlapping expensive ONNX runs.
let processingQueue: Promise<void> = Promise.resolve();

function fileSignature(file: File): string {
  return JSON.stringify([file.name, file.size, file.lastModified, file.type]);
}

function isCurrent(subject: PortraitSubject, file: File): boolean {
  return atelierState.portrait.subjects.some(
    (item) => item.id === subject.id && item.photo === file,
  );
}

function storageKey(id: string): string {
  return `pet-cutout:${CACHE_VERSION}:${id}`;
}

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
    request.onerror = () => reject(request.error ?? new Error("Cutout database unavailable."));
  });
}

async function readStoredCutout(id: string, file: File): Promise<Blob | null> {
  const database = await openDatabase();
  try {
    const record = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(storageKey(id));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Cannot read cutout."));
    });
    if (
      record && typeof record === "object" &&
      "signature" in record && "blob" in record &&
      record.signature === fileSignature(file) && record.blob instanceof Blob
    ) {
      return (record as StoredCutout).blob;
    }
    return null;
  } finally {
    database.close();
  }
}

async function saveStoredCutout(id: string, file: File, blob: Blob): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const value: StoredCutout = { signature: fileSignature(file), blob };
      transaction.objectStore(STORE_NAME).put(value, storageKey(id));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Cannot save cutout."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Cutout save cancelled."));
    });
  } finally {
    database.close();
  }
}

async function canvasFromBlob(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(bitmap, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function cropCutout(blob: Blob): Promise<HTMLCanvasElement> {
  const source = await canvasFromBlob(blob);
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable.");
  const data = ctx.getImageData(0, 0, source.width, source.height).data;
  let left = source.width;
  let top = source.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (data[(y * source.width + x) * 4 + 3] < 20) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error("No pet detected.");
  const cropped = document.createElement("canvas");
  cropped.width = right - left + 1;
  cropped.height = bottom - top + 1;
  const croppedCtx = cropped.getContext("2d");
  if (!croppedCtx) throw new Error("Canvas is unavailable.");
  croppedCtx.drawImage(
    source, left, top, cropped.width, cropped.height,
    0, 0, cropped.width, cropped.height,
  );
  return cropped;
}

/** Slightly soften only the transparency mask, not the pet's RGB pixels.
 * This does NOT remove unwanted objects retained by segmentation.
 */
function featherAlpha(source: HTMLCanvasElement): HTMLCanvasElement {
  if (EDGE_FEATHER_PX <= 0) return source;
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) return source;

  const pixels = context.getImageData(0, 0, width, height);
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const maskContext = mask.getContext("2d");
  if (!maskContext) return source;
  const maskPixels = maskContext.createImageData(width, height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    maskPixels.data[i] = 255;
    maskPixels.data[i + 1] = 255;
    maskPixels.data[i + 2] = 255;
    maskPixels.data[i + 3] = pixels.data[i + 3];
  }
  maskContext.putImageData(maskPixels, 0, 0);

  const softened = document.createElement("canvas");
  softened.width = width;
  softened.height = height;
  const softContext = softened.getContext("2d", { willReadFrequently: true });
  if (!softContext) return source;
  softContext.filter = `blur(${EDGE_FEATHER_PX}px)`;
  softContext.drawImage(mask, 0, 0);
  softContext.filter = "none";
  const softPixels = softContext.getImageData(0, 0, width, height).data;
  for (let i = 0; i < pixels.data.length; i += 4) {
    // Keep fully opaque interior pixels unchanged; blend only partial edges.
    const original = pixels.data[i + 3];
    if (original !== 255) pixels.data[i + 3] = softPixels[i + 3];
  }
  context.putImageData(pixels, 0, 0);
  return source;
}

export type PetCutoutStatus = "idle" | "preparing" | "ready" | "error";
const cutoutStatuses = new Map<string, { file: File; status: PetCutoutStatus }>();

export function getPetCutoutStatus(subject: PortraitSubject): PetCutoutStatus {
  if (cache.get(subject.id)?.file === subject.photo) return "ready";
  const current = cutoutStatuses.get(subject.id);
  return current?.file === subject.photo ? current.status : "idle";
}

function updateCutoutStatus(subject: PortraitSubject, file: File, status: PetCutoutStatus): void {
  if (!isCurrent(subject, file)) return;
  cutoutStatuses.set(subject.id, { file, status });
  document.dispatchEvent(new CustomEvent("atelier:cutout-status", {
    detail: { subjectId: subject.id, status },
  }));
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to cache pet cutout."));
    }, "image/png");
  });
}

function queueInference(file: File): Promise<Blob> {
  const task = processingQueue.then(() => getPetCutoutBlob(file));
  // Keep the queue usable even when one photograph fails.
  processingQueue = task.then(() => undefined, () => undefined);
  return task;
}

/** In-memory, in-flight and persistent cutout caching shared by Steps 2–4. */
export function preparePetCutout(subject: PortraitSubject): Promise<HTMLCanvasElement> {
  const cached = cache.get(subject.id);
  if (cached?.file === subject.photo) return Promise.resolve(cached.image);
  const running = pending.get(subject.id);
  if (running?.file === subject.photo) return running.promise;

  const file = subject.photo;
  updateCutoutStatus(subject, file, "preparing");
  const promise = (async () => {
    // IndexedDB is an optional performance cache; errors should not prevent processing.
    let stored: Blob | null = null;
    try {
      stored = await readStoredCutout(subject.id, file);
    } catch {
      stored = null;
    }

    let image: HTMLCanvasElement;
    if (stored) {
      try {
        image = await canvasFromBlob(stored);
      } catch {
        stored = null;
        image = featherAlpha(await cropCutout(await queueInference(file)));
      }
    } else {
      image = featherAlpha(await cropCutout(await queueInference(file)));
    }

    if (isCurrent(subject, file)) {
      cache.set(subject.id, { file, image });
      updateCutoutStatus(subject, file, "ready");
      document.dispatchEvent(new Event("atelier:cutout-ready"));
      if (!stored) {
        try {
          await saveStoredCutout(subject.id, file, await canvasToBlob(image));
        } catch {
          // Private-browser restrictions or storage quotas must not break the Atelier.
        }
      }
    }
    return image;
  })();

  pending.set(subject.id, { file, promise });
  void promise.then(
    () => { if (pending.get(subject.id)?.promise === promise) pending.delete(subject.id); },
    () => {
      if (pending.get(subject.id)?.promise === promise) pending.delete(subject.id);
      updateCutoutStatus(subject, file, "error");
    },
  );
  return promise;
}

/** Start extraction on Step 2 without delaying upload or navigation. */
export function preloadPetCutouts(): void {
  for (const subject of atelierState.portrait.subjects) {
    void preparePetCutout(subject).catch(() => {
      // The canvas screen reports processing failures if preparation is needed there.
    });
  }
}

/** Paint the same normalized arrangement onto a transparent canvas. */
export function drawMultiPetComposition(width: number, height: number): HTMLCanvasElement | null {
  const subjects = atelierState.portrait.subjects;
  if (subjects.length < 2) return null;
  if (!subjects.every((subject) => cache.get(subject.id)?.file === subject.photo)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const ordered = [...subjects].sort((a, b) => a.layer - b.layer);
  // Shadows render underneath every pet, including when pets overlap.
  for (const subject of ordered) {
    const cutout = cache.get(subject.id);
    if (!cutout || !hasGroundShadow(subject.id)) continue;
    const image = cutout.image;
    const scale = canvas.height * BASE_HEIGHT / image.height * subject.scale;
    drawGroundShadow(ctx, image, subject.position.x * canvas.width,
      subject.position.y * canvas.height, scale);
  }
  for (const subject of ordered) {
    const cutout = cache.get(subject.id);
    if (!cutout) continue;
    const image = cutout.image;
    const scale = canvas.height * BASE_HEIGHT / image.height * subject.scale;
    ctx.save();
    ctx.translate(subject.position.x * canvas.width, subject.position.y * canvas.height);
    ctx.rotate(subject.rotation * Math.PI / 180);
    ctx.drawImage(image, -image.width * scale / 2, -image.height * scale / 2,
      image.width * scale, image.height * scale);
    ctx.restore();
  }
  return canvas;
}

// Existing Step 2 emits this event after additions/removals.
document.addEventListener("atelier:subjects-changed", preloadPetCutouts);
