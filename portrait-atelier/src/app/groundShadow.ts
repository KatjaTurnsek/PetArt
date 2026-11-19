/**
 * Ground shadows shared by the editable Konva canvas, size comparison,
 * shape thumbnails and Step 4. Does not modify pet cutouts or run AI.
 *
 * Replace only this file; all consumers keep their current API.
 */
const STORAGE_PREFIX = "atelier:ground-shadow:";

// Treat each cropped pet cutout as an image with a ground-contact point.
// Cache that analysis: during dragging we only recalculate simple geometry.
const contactCache = new WeakMap<HTMLCanvasElement, { x: number; y: number }>();
let shadowSprite: HTMLCanvasElement | null = null;

/** Existing per-pet checkbox remains compatible with saved settings. */
export function hasGroundShadow(subjectId: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + subjectId) !== "0";
  } catch {
    return true;
  }
}

export function setGroundShadow(subjectId: string, enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + subjectId, enabled ? "1" : "0");
  } catch {
    // Shadow selection still works for the current visit if storage is blocked.
  }
}

/**
 * Pre-render a strong, narrow contact patch and a wider ambient falloff.
 * All drawing methods use this same sprite; no blur is calculated per frame.
 */
export function getGroundShadowSprite(): HTMLCanvasElement {
  if (shadowSprite) return shadowSprite;

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Ground-shadow canvas is unavailable.");
  const context = ctx;

  function ellipseGradient(
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    stops: Array<[number, string]>,
  ): void {
    context.save();
    context.translate(centerX, centerY);
    context.scale(radiusX, radiusY);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, 1, 0, 2 * Math.PI);
    context.fill();
    context.restore();
  }

  // Wide, softly diffused floor shadow.
  ellipseGradient(256, 97, 252, 91, [
    [0, "rgba(49, 37, 28, 0.30)"],
    [0.38, "rgba(49, 37, 28, 0.20)"],
    [0.75, "rgba(49, 37, 28, 0.06)"],
    [1, "rgba(49, 37, 28, 0)"],
  ]);

  // Dark, compact contact directly beneath the feet/body.
  ellipseGradient(256, 90, 165, 31, [
    [0, "rgba(39, 30, 24, 0.78)"],
    [0.32, "rgba(39, 30, 24, 0.57)"],
    [0.70, "rgba(39, 30, 24, 0.15)"],
    [1, "rgba(39, 30, 24, 0)"],
  ]);

  shadowSprite = canvas;
  return canvas;
}

/**
 * Find a likely ground-contact area from the alpha pixels near the lower body.
 * A few stray hairs or a hanging ribbon should not determine the entire shadow.
 * Coordinates are normalized to the cropped cutout (0..1).
 */
function contactPoint(image: HTMLCanvasElement): { x: number; y: number } {
  const cached = contactCache.get(image);
  if (cached) return cached;

  const width = image.width;
  const height = image.height;
  const fallback = { x: 0.5, y: 0.96 };
  if (width <= 0 || height <= 0) return fallback;

  const ctx = image.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return fallback;
  }

  const xStart = Math.floor(width * 0.17);
  const xEnd = Math.max(xStart + 1, Math.ceil(width * 0.83));
  const stepX = Math.max(1, Math.floor(width / 260));
  const stepY = Math.max(1, Math.floor(height / 420));
  const thresholdCount = Math.max(2, Math.ceil(((xEnd - xStart) / stepX) * 0.065));

  // Bottom-up: seek the last *substantial* line of the pet rather than a thin
  // ribbon, isolated hair, or tiny transparent fringe.
  let contactY = Math.floor(height * 0.96);
  let found = false;
  for (let y = height - 1; y >= Math.floor(height * 0.64); y -= stepY) {
    let count = 0;
    for (let x = xStart; x < xEnd; x += stepX) {
      if (data[(y * width + x) * 4 + 3] >= 110) count++;
    }
    if (count >= thresholdCount) {
      contactY = y;
      found = true;
      break;
    }
  }

  // Work out the centre of the bottom of the body so an off-centre tail or
  // ribbon doesn't pull the shadow away from the feet.
  let weightedX = 0;
  let total = 0;
  if (found) {
    const bandTop = Math.max(0, contactY - Math.floor(height * 0.08));
    for (let y = bandTop; y <= contactY; y += stepY) {
      for (let x = xStart; x < xEnd; x += stepX) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha < 125) continue;
        weightedX += x * alpha;
        total += alpha;
      }
    }
  }

  const result = {
    x: total > 0 ? Math.min(0.72, Math.max(0.28, weightedX / total / width)) : 0.5,
    y: Math.min(0.995, Math.max(0.7, contactY / height)),
  };
  contactCache.set(image, result);
  return result;
}

/**
 * One coordinate system for every preview: the *rendered* pet width/height.
 * The shadow centre overlaps the detected feet instead of floating below.
 */
export function groundShadowBounds(
  image: HTMLCanvasElement,
  x: number,
  y: number,
  scale: number,
): { x: number; y: number; width: number; height: number } {
  const petWidth = image.width * scale;
  const petHeight = image.height * scale;
  const point = contactPoint(image);

  // Use proportional sizing, not a fixed number of screen pixels: this keeps
  // the editable and comparison canvases visually consistent.
  const shadowWidth = petWidth * 0.93;
  const shadowHeight = petHeight * 0.20;

  const groundX = x + (point.x - 0.5) * petWidth;
  const groundY = y + (point.y - 0.5) * petHeight;

  // Put the shadow centre at the paws, overlapping the bottom of the cutout.
  // The pet is drawn above it and covers the rear half naturally.
  const centerY = groundY - shadowHeight * 0.045;

  return {
    x: groundX - shadowWidth / 2,
    y: centerY - shadowHeight / 2,
    width: shadowWidth,
    height: shadowHeight,
  };
}

/** Draw the shadow before drawing the animal. */
export function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  x: number,
  y: number,
  scale: number,
): void {
  const bounds = groundShadowBounds(image, x, y, scale);
  ctx.drawImage(
    getGroundShadowSprite(),
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
  );
}
