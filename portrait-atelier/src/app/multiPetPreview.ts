import { atelierState } from "./atelierState";
import type { PortraitSubject } from "./atelierState";
import { removeBackground } from "../services/backgroundRemoval";

const BASE_HEIGHT = 0.56;
type Cutout = { file: File; image: HTMLCanvasElement };
const cache = new Map<string, Cutout>();
const pending = new Map<string, { file: File; promise: Promise<HTMLCanvasElement> }>();

/** Crop transparent margins so the pet is positioned by its visible outline. */
async function cropCutout(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const source = document.createElement("canvas");
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const ctx = source.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is unavailable.");
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, source.width, source.height).data;
    let left = source.width, top = source.height, right = -1, bottom = -1;
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
    cropped.getContext("2d")?.drawImage(
      source, left, top, cropped.width, cropped.height,
      0, 0, cropped.width, cropped.height,
    );
    return cropped;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reuses completed cutouts and shares in-flight AI work between screens. */
export async function preparePetCutout(subject: PortraitSubject): Promise<HTMLCanvasElement> {
  const cached = cache.get(subject.id);
  if (cached?.file === subject.photo) return cached.image;
  const running = pending.get(subject.id);
  if (running?.file === subject.photo) return running.promise;
  const file = subject.photo;
  const promise = removeBackground(file).then(cropCutout).then((image) => {
    const current = atelierState.portrait.subjects.find((item) => item.id === subject.id);
    if (current?.photo === file) {
      cache.set(subject.id, { file, image });
      document.dispatchEvent(new Event("atelier:cutout-ready"));
    }
    return image;
  });
  pending.set(subject.id, { file, promise });
  void promise.finally(() => {
    if (pending.get(subject.id)?.promise === promise) pending.delete(subject.id);
  }).catch(() => { /* Errors are reported by the calling screen. */ });
  return promise;
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
