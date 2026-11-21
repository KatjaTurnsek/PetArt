/**
 * Low-cost, local background reconstruction for the single-pet softened preview.
 * The BiRefNet alpha cutout marks the missing pixels. A multi-resolution colour
 * pyramid interpolates nearby scenery through that region. No model or server.
 * This is a deliberately approximate preview, not photographic inpainting.
 */
interface Level {
  width: number;
  height: number;
  rgb: Uint8ClampedArray;
  valid: Uint8Array;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Expand silhouette to cover soft alpha edges and prevent a ghost outline. */
function expandSilhouette(alpha: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const radius = Math.max(4, Math.round(Math.max(width, height) * 0.007));
  const horizontal = new Uint8Array(width * height);
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let covered = false;
      for (let dx = -radius; dx <= radius; dx++) {
        const px = Math.min(width - 1, Math.max(0, x + dx));
        if (alpha[(row + px) * 4 + 3] > 12) { covered = true; break; }
      }
      horizontal[row + x] = covered ? 1 : 0;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let covered = false;
      for (let dy = -radius; dy <= radius; dy++) {
        const py = Math.min(height - 1, Math.max(0, y + dy));
        if (horizontal[py * width + x]) { covered = true; break; }
      }
      result[y * width + x] = covered ? 1 : 0;
    }
  }
  return result;
}

function downsample(level: Level): Level {
  const width = Math.max(1, Math.ceil(level.width / 2));
  const height = Math.max(1, Math.ceil(level.height / 2));
  const rgb = new Uint8ClampedArray(width * height * 3);
  const valid = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let count = 0, red = 0, green = 0, blue = 0;
      for (let dy = 0; dy < 2; dy++) {
        const sourceY = y * 2 + dy;
        if (sourceY >= level.height) continue;
        for (let dx = 0; dx < 2; dx++) {
          const sourceX = x * 2 + dx;
          if (sourceX >= level.width) continue;
          const source = sourceY * level.width + sourceX;
          if (!level.valid[source]) continue;
          count++;
          red += level.rgb[source * 3];
          green += level.rgb[source * 3 + 1];
          blue += level.rgb[source * 3 + 2];
        }
      }
      const dest = y * width + x;
      if (count) {
        valid[dest] = 1;
        rgb[dest * 3] = red / count;
        rgb[dest * 3 + 1] = green / count;
        rgb[dest * 3 + 2] = blue / count;
      }
    }
  }
  return { width, height, rgb, valid };
}

function fillUnknown(levels: Level[]): void {
  // Seed the coarsest missing cells with the overall visible background colour.
  const coarse = levels[levels.length - 1];
  let count = 0, red = 0, green = 0, blue = 0;
  for (let i = 0; i < coarse.valid.length; i++) {
    if (!coarse.valid[i]) continue;
    count++;
    red += coarse.rgb[i * 3];
    green += coarse.rgb[i * 3 + 1];
    blue += coarse.rgb[i * 3 + 2];
  }
  for (let i = 0; i < coarse.valid.length; i++) {
    if (coarse.valid[i]) continue;
    coarse.rgb[i * 3] = count ? red / count : 160;
    coarse.rgb[i * 3 + 1] = count ? green / count : 155;
    coarse.rgb[i * 3 + 2] = count ? blue / count : 145;
    coarse.valid[i] = 1;
  }

  // Push interpolated colours from coarse to fine only where pixels are missing.
  for (let levelIndex = levels.length - 2; levelIndex >= 0; levelIndex--) {
    const fine = levels[levelIndex];
    const parent = levels[levelIndex + 1];
    for (let y = 0; y < fine.height; y++) {
      const py = Math.min(parent.height - 1, Math.floor(y / 2));
      for (let x = 0; x < fine.width; x++) {
        const destination = y * fine.width + x;
        if (fine.valid[destination]) continue;
        const px = Math.min(parent.width - 1, Math.floor(x / 2));
        const source = (py * parent.width + px) * 3;
        fine.rgb[destination * 3] = parent.rgb[source];
        fine.rgb[destination * 3 + 1] = parent.rgb[source + 1];
        fine.rgb[destination * 3 + 2] = parent.rgb[source + 2];
        fine.valid[destination] = 1;
      }
    }
  }
}

export async function reconstructPetBackground(photo: File, cutout: Blob): Promise<File> {
  const [sourceBitmap, subjectBitmap] = await Promise.all([
    createImageBitmap(photo),
    createImageBitmap(cutout),
  ]);
  try {
    // Keep this lower-resolution: this fill is only intended as a blurred preview.
    const limit = 900;
    const factor = Math.min(1, limit / Math.max(sourceBitmap.width, sourceBitmap.height));
    const width = Math.max(1, Math.round(sourceBitmap.width * factor));
    const height = Math.max(1, Math.round(sourceBitmap.height * factor));
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is unavailable for background reconstruction.");
    ctx.drawImage(sourceBitmap, 0, 0, width, height);
    const original = ctx.getImageData(0, 0, width, height);

    const maskCanvas = makeCanvas(width, height);
    const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!maskCtx) throw new Error("Canvas is unavailable for cutout masking.");
    maskCtx.clearRect(0, 0, width, height);
    maskCtx.drawImage(subjectBitmap, 0, 0, width, height);
    const alpha = maskCtx.getImageData(0, 0, width, height).data;
    const silhouette = expandSilhouette(alpha, width, height);

    const rgb = new Uint8ClampedArray(width * height * 3);
    const valid = new Uint8Array(width * height);
    for (let i = 0; i < valid.length; i++) {
      rgb[i * 3] = original.data[i * 4];
      rgb[i * 3 + 1] = original.data[i * 4 + 1];
      rgb[i * 3 + 2] = original.data[i * 4 + 2];
      valid[i] = silhouette[i] ? 0 : 1;
    }
    const levels: Level[] = [{ width, height, rgb, valid }];
    while (Math.max(levels[levels.length - 1].width, levels[levels.length - 1].height) > 1) {
      levels.push(downsample(levels[levels.length - 1]));
    }
    fillUnknown(levels);

    // Retain every original pixel outside the expanded dog silhouette.
    for (let i = 0; i < silhouette.length; i++) {
      if (!silhouette[i]) continue;
      original.data[i * 4] = rgb[i * 3];
      original.data[i * 4 + 1] = rgb[i * 3 + 1];
      original.data[i * 4 + 2] = rgb[i * 3 + 2];
      original.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(original, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("Background reconstruction failed.")),
        "image/webp", 0.91,
      );
    });
    return new File([blob], "reconstructed-scene.webp", { type: "image/webp" });
  } finally {
    sourceBitmap.close();
    subjectBitmap.close();
  }
}
