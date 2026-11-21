/**
 * Step 5 — fast picture-frame renderer.
 * Frame corners and rails share a source profile, so the joins align.
 * Frame rasters and decoded images are cached; pet cutouts are never reprocessed.
 */
export type FrameStyle = "none" | "rustic" | "antique-gold" | "natural-wood";

type DecoratedStyle = Exclude<FrameStyle, "none">;

const FRAME_ASSETS: Record<DecoratedStyle, { corner: string; edge: string }> = {
  rustic: {
    corner: "/frames/rustic-corner.png?v=3",
    edge: "/frames/rustic-edge.png?v=3",
  },
  "antique-gold": {
    corner: "/frames/antique-gold-corner.png?v=3",
    edge: "/frames/antique-gold-edge.png?v=3",
  },
  "natural-wood": {
    corner: "/frames/natural-wood-corner.png?v=3",
    edge: "/frames/natural-wood-edge.png?v=3",
  },
};

const decodedImages = new Map<string, Promise<HTMLImageElement>>();
const finishedFrames = new Map<string, HTMLCanvasElement>();
const latestRequest = new WeakMap<HTMLCanvasElement, number>();
const MAX_CACHED_FRAMES = 8;

function loadImage(url: string): Promise<HTMLImageElement> {
  const existing = decodedImages.get(url);
  if (existing) return existing;

  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Frame asset failed to load: ${url}`));
    img.src = url;
  }).catch((error: unknown) => {
    decodedImages.delete(url);
    throw error;
  });

  decodedImages.set(url, request);
  return request;
}

function getCachedFrame(key: string): HTMLCanvasElement | undefined {
  const existing = finishedFrames.get(key);
  if (existing) {
    // Move to the end so the least-recently-used render is removed first.
    finishedFrames.delete(key);
    finishedFrames.set(key, existing);
  }
  return existing;
}

function storeFrame(key: string, canvas: HTMLCanvasElement): void {
  finishedFrames.set(key, canvas);
  while (finishedFrames.size > MAX_CACHED_FRAMES) {
    const first = finishedFrames.keys().next().value;
    if (first === undefined) break;
    finishedFrames.delete(first);
  }
}

function paintFrame(
  canvas: HTMLCanvasElement,
  corner: HTMLImageElement,
  edge: HTMLImageElement,
  logicalWidth: number,
  logicalHeight: number,
  thickness: number,
  ratio: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Frame canvas is unavailable.");

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, logicalWidth, logicalHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Compute the corner size from the image profile itself. The corner is
  // square, while the rail height is exactly one frame moulding thickness.
  const scale = Math.min(
    thickness / edge.naturalHeight,
    logicalWidth / (2 * corner.naturalWidth),
    logicalHeight / (2 * corner.naturalHeight),
  );
  const size = corner.naturalWidth * scale;
  const railThickness = edge.naturalHeight * scale;
  const horizontal = Math.max(0, logicalWidth - 2 * size);
  const vertical = Math.max(0, logicalHeight - 2 * size);

  if (horizontal > 0) {
    ctx.drawImage(edge, size, 0, horizontal, railThickness);
    ctx.save();
    ctx.translate(logicalWidth - size, logicalHeight);
    ctx.rotate(Math.PI);
    ctx.drawImage(edge, 0, 0, horizontal, railThickness);
    ctx.restore();
  }

  if (vertical > 0) {
    ctx.save();
    ctx.translate(0, logicalHeight - size);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(edge, 0, 0, vertical, railThickness);
    ctx.restore();

    ctx.save();
    ctx.translate(logicalWidth, size);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(edge, 0, 0, vertical, railThickness);
    ctx.restore();
  }

  // Keep corners sharp; only the straight rails are stretched.
  const corners = [
    { x: 0, y: 0, angle: 0 },
    { x: logicalWidth, y: 0, angle: Math.PI / 2 },
    { x: logicalWidth, y: logicalHeight, angle: Math.PI },
    { x: 0, y: logicalHeight, angle: (3 * Math.PI) / 2 },
  ];

  for (const item of corners) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.angle);
    ctx.drawImage(corner, 0, 0, size, size);
    ctx.restore();
  }
}

/** Draws onto the supplied canvas; never alters the portrait composition. */
export async function drawPictureFrame(
  target: HTMLCanvasElement,
  style: FrameStyle,
  width: number,
  height: number,
  thickness: number,
): Promise<void> {
  const requestNumber = (latestRequest.get(target) ?? 0) + 1;
  latestRequest.set(target, requestNumber);

  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const t = Math.max(0, Math.round(thickness));
  // 1.5x caps the GPU and memory cost while remaining crisp at preview sizes.
  const pixelRatio = Math.min(1.5, window.devicePixelRatio || 1);
  const pixelsWide = Math.max(1, Math.round(w * pixelRatio));
  const pixelsHigh = Math.max(1, Math.round(h * pixelRatio));

  if (style === "none") {
    if (target.width !== pixelsWide) target.width = pixelsWide;
    if (target.height !== pixelsHigh) target.height = pixelsHigh;
    const ctx = target.getContext("2d");
    ctx?.clearRect(0, 0, pixelsWide, pixelsHigh);
    return;
  }

  const cacheKey = `${style}:${w}x${h}:${t}:${pixelRatio}`;
  let prepared = getCachedFrame(cacheKey);

  if (!prepared) {
    const sources = FRAME_ASSETS[style];
    const [corner, edge] = await Promise.all([
      loadImage(sources.corner),
      loadImage(sources.edge),
    ]);

    // A newer selection or resize has replaced this request.
    if (latestRequest.get(target) !== requestNumber) return;

    prepared = document.createElement("canvas");
    prepared.width = pixelsWide;
    prepared.height = pixelsHigh;
    paintFrame(prepared, corner, edge, w, h, t, pixelRatio);
    storeFrame(cacheKey, prepared);
  }

  if (latestRequest.get(target) !== requestNumber) return;
  if (target.width !== pixelsWide) target.width = pixelsWide;
  if (target.height !== pixelsHigh) target.height = pixelsHigh;
  const ctx = target.getContext("2d");
  if (!ctx) throw new Error("Frame preview canvas is unavailable.");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixelsWide, pixelsHigh);
  ctx.drawImage(prepared, 0, 0);
}
