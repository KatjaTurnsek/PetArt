/**
 * Stage 2 — catalogue-driven frame renderer.
 * All geometry is derived from each moulding's source profile depth.
 * The inner opening is exactly the size of the visible painting; nothing is cropped.
 * No modification of supplied PNG assets is required.
 */
import { FRAME_DEFINITIONS } from "./frameDefinitions";
import { drawPictureFrame as drawLegacyFrame, type FrameStyle } from "./frameRenderer";
export type { FrameStyle };

type DecoratedStyle = Exclude<FrameStyle, "none">;
type SourceRect = { x: number; y: number; width: number; height: number };

const loadedImages = new Map<string, Promise<HTMLImageElement>>();
const rasterCache = new Map<string, HTMLCanvasElement>();
const generation = new WeakMap<HTMLCanvasElement, number>();
const CACHE_LIMIT = 8;

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = loadedImages.get(url);
  if (cached) return cached;
  // Version key is Stage 2's namespace. It does not modify the image.
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load frame asset ${url}`));
    image.src = `${url}${url.includes("?") ? "&" : "?"}renderer=v2`;
  }).catch((error: unknown) => {
    loadedImages.delete(url);
    throw error;
  });
  loadedImages.set(url, promise);
  return promise;
}

function drawRail(
  context: CanvasRenderingContext2D,
  rail: HTMLImageElement,
  src: SourceRect,
  x: number,
  y: number,
  length: number,
  thickness: number,
  mode: "stretch" | "repeat" | "segmented",
): void {
  if (length <= 0 || thickness <= 0) return;
  if (mode !== "repeat") {
    context.drawImage(rail, src.x, src.y, src.width, src.height, x, y, length, thickness);
    return;
  }
  const tileWidth = src.width * (thickness / src.height);
  if (tileWidth < 1) return;
  let drawn = 0;
  while (drawn < length) {
    const portion = Math.min(tileWidth, length - drawn);
    const sourceWidth = src.width * portion / tileWidth;
    context.drawImage(rail, src.x, src.y, sourceWidth, src.height,
      x + drawn, y, portion + Math.min(0.2, length - drawn - portion), thickness);
    drawn += portion;
  }
}

function rasterizeFrame(
  output: HTMLCanvasElement,
  style: DecoratedStyle,
  corner: HTMLImageElement,
  rail: HTMLImageElement,
  width: number,
  height: number,
  thickness: number,
  pixelRatio: number,
): void {
  const definition = FRAME_DEFINITIONS[style];
  const { profileDepthPx, railCrop, plannedRailMode } = definition.rendering;
  if (profileDepthPx <= 0 || railCrop.width <= 0 || railCrop.height <= 0 ||
      railCrop.x + railCrop.width > rail.naturalWidth ||
      railCrop.y + railCrop.height > rail.naturalHeight) {
    throw new Error(`Invalid rail measurements for ${style}`);
  }
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // A 360px corner with a 278px profile, for example, is drawn at
  // thickness * (360 / 278). That matches the straight rail's depth.
  // Keep full-size corners rather than scaling the ornament separately.
  const safeScale = Math.min(thickness / profileDepthPx,
    width / (2 * corner.naturalWidth), height / (2 * corner.naturalHeight));
  const actualThickness = profileDepthPx * safeScale;
  const cornerWidth = corner.naturalWidth * safeScale;
  const cornerHeight = corner.naturalHeight * safeScale;
  const horizontalLength = Math.max(0, width - 2 * cornerWidth);
  const verticalLength = Math.max(0, height - 2 * cornerHeight);

  // Rails cover the exact outer band; corners cover the ends. The very small
  // intersection prevents antialiasing seams between two canvas draw calls.
  const join = 0.5;
  const horizontalX = cornerWidth - join;
  const verticalY = cornerHeight - join;
  const hLength = horizontalLength + join * 2;
  const vLength = verticalLength + join * 2;

  drawRail(ctx, rail, railCrop, horizontalX, 0, hLength, actualThickness, plannedRailMode);
  ctx.save();
  ctx.translate(width, height);
  ctx.rotate(Math.PI);
  drawRail(ctx, rail, railCrop, horizontalX, 0, hLength, actualThickness, plannedRailMode);
  ctx.restore();

  ctx.save();
  ctx.translate(0, height);
  ctx.rotate(-Math.PI / 2);
  drawRail(ctx, rail, railCrop, verticalY, 0, vLength, actualThickness, plannedRailMode);
  ctx.restore();

  ctx.save();
  ctx.translate(width, 0);
  ctx.rotate(Math.PI / 2);
  drawRail(ctx, rail, railCrop, verticalY, 0, vLength, actualThickness, plannedRailMode);
  ctx.restore();

  for (const { x, y, angle } of [
    { x: 0, y: 0, angle: 0 },
    { x: width, y: 0, angle: Math.PI / 2 },
    { x: width, y: height, angle: Math.PI },
    { x: 0, y: height, angle: 3 * Math.PI / 2 },
  ]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(corner, 0, 0, cornerWidth, cornerHeight);
    ctx.restore();
  }
}

/** Same public signature as the existing renderer: safe drop-in for Step 5. */
export async function drawPictureFrame(
  target: HTMLCanvasElement,
  style: FrameStyle,
  width: number,
  height: number,
  thickness: number,
): Promise<void> {
  const request = (generation.get(target) ?? 0) + 1;
  generation.set(target, request);
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const t = Math.max(0, thickness);
  const ratio = Math.min(1.5, window.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(w * ratio));
  const pixelHeight = Math.max(1, Math.round(h * ratio));

  if (style === "none" || t === 0) {
    target.width = pixelWidth;
    target.height = pixelHeight;
    return;
  }

  const definition = FRAME_DEFINITIONS[style];
  const key = [style, w, h, t, ratio, definition.rendering.profileDepthPx,
    definition.rendering.plannedRailMode, JSON.stringify(definition.rendering.railCrop)].join(":");
  let raster = rasterCache.get(key);

  try {
    if (!raster) {
      const [corner, rail] = await Promise.all([
        loadImage(definition.assets.corner),
        loadImage(definition.assets.edge),
      ]);
      if (generation.get(target) !== request) return;
      raster = document.createElement("canvas");
      raster.width = pixelWidth;
      raster.height = pixelHeight;
      rasterizeFrame(raster, style, corner, rail, w, h, t, ratio);
      rasterCache.set(key, raster);
      while (rasterCache.size > CACHE_LIMIT) {
        const first = rasterCache.keys().next().value;
        if (first !== undefined) rasterCache.delete(first);
      }
    }
    if (generation.get(target) !== request) return;
    if (target.width !== pixelWidth) target.width = pixelWidth;
    if (target.height !== pixelHeight) target.height = pixelHeight;
    const context = target.getContext("2d");
    if (!context) throw new Error("Frame preview context unavailable");
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.drawImage(raster, 0, 0);
  } catch (error: unknown) {
    // Legacy fallback keeps Step 5 usable if a new catalogue entry is incorrect.
    if (generation.get(target) !== request) return;
    console.warn("New frame renderer failed; using legacy frame renderer.", error);
    await drawLegacyFrame(target, style, width, height, thickness);
  }
}
