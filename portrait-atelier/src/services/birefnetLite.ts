import * as ort from "onnxruntime-web";

/** Experimental BiRefNet Lite backend. Do not replace the production remover yet. */
const MODEL_PATH = "/models/birefnet_lite_512_fp16w.onnx";
const MODEL_SIZE = 512;
const MAX_OUTPUT_DIMENSION = 1600;
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "basic",
    }).catch((error: unknown) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

function buildInput(image: ImageBitmap): ort.Tensor {
  const canvas = document.createElement("canvas");
  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create a preprocessing canvas.");
  // Model documentation specifies direct resize to a square, without padding.
  ctx.drawImage(image, 0, 0, MODEL_SIZE, MODEL_SIZE);
  const rgba = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  const pixels = MODEL_SIZE * MODEL_SIZE;
  const data = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    for (let channel = 0; channel < 3; channel++) {
      data[channel * pixels + i] =
        (rgba[i * 4 + channel] / 255 - MEAN[channel]) / STD[channel];
    }
  }
  return new ort.Tensor("float32", data, [1, 3, MODEL_SIZE, MODEL_SIZE]);
}

function buildMask(logits: Float32Array): HTMLCanvasElement {
  const expected = MODEL_SIZE * MODEL_SIZE;
  if (logits.length < expected) {
    throw new Error("BiRefNet returned an unexpected output size.");
  }
  const mask = document.createElement("canvas");
  mask.width = MODEL_SIZE;
  mask.height = MODEL_SIZE;
  const ctx = mask.getContext("2d");
  if (!ctx) throw new Error("Could not create a segmentation mask.");
  const pixels = ctx.createImageData(MODEL_SIZE, MODEL_SIZE);
  for (let i = 0; i < expected; i++) {
    const logit = logits[i];
    if (!Number.isFinite(logit)) throw new Error("Invalid BiRefNet mask value.");
    // BiRefNet exports raw logits, unlike some U2Net exports.
    const alpha = 1 / (1 + Math.exp(-logit));
    const intensity = Math.round(255 * alpha);
    const p = i * 4;
    pixels.data[p] = intensity;
    pixels.data[p + 1] = intensity;
    pixels.data[p + 2] = intensity;
    pixels.data[p + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return mask;
}

async function applyMask(image: ImageBitmap, mask: HTMLCanvasElement): Promise<Blob> {
  const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const photoCanvas = document.createElement("canvas");
  photoCanvas.width = width;
  photoCanvas.height = height;
  const photoCtx = photoCanvas.getContext("2d", { willReadFrequently: true });
  if (!photoCtx) throw new Error("Could not prepare the output photograph.");
  photoCtx.drawImage(image, 0, 0, width, height);

  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = width;
  alphaCanvas.height = height;
  const alphaCtx = alphaCanvas.getContext("2d", { willReadFrequently: true });
  if (!alphaCtx) throw new Error("Could not upscale the mask.");
  alphaCtx.imageSmoothingEnabled = true;
  alphaCtx.imageSmoothingQuality = "high";
  alphaCtx.drawImage(mask, 0, 0, width, height);

  // Use the grayscale mask as alpha, without changing the original RGB pixels.
  const alphaPixels = alphaCtx.getImageData(0, 0, width, height);
  const maskData = alphaPixels.data;
  const photoPixels = photoCtx.getImageData(0, 0, width, height);
  const photoData = photoPixels.data;
  for (let i = 0; i < photoData.length; i += 4) {
    photoData[i + 3] = maskData[i];
  }
  photoCtx.putImageData(photoPixels, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    photoCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to export the BiRefNet cutout."));
    }, "image/png");
  });
}

/** Returns a transparent PNG Blob, preserving the source File. */
export async function removeBackgroundWithBiRefNet(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);
  try {
    const session = await getSession();
    const feeds = { [session.inputNames[0]]: buildInput(image) };
    const output = await session.run(feeds);
    const result = output[session.outputNames[0]];
    if (!result || !(result.data instanceof Float32Array)) {
      throw new Error("BiRefNet returned an unsupported output type.");
    }
    return await applyMask(image, buildMask(result.data));
  } finally {
    image.close();
  }
}
