import { removeBackgroundWithBiRefNet } from "./birefnetLite";
import * as ort from "onnxruntime-web";

const MODEL_URL = "/models/u2netp.onnx";
const MODEL_SIZE = 320;
const MAX_OUTPUT_DIMENSION = 1600;

// The model's output is probabilistic, not a clean silhouette.
// Values below MASK_SOFT_START are transparent; above MASK_SOLID_START
// are fully opaque. The transition preserves a small, soft edge.
const MASK_SOFT_START = 0.24;
const MASK_SOLID_START = 0.68;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let sessionPromise: Promise<ort.InferenceSession> | null = null;

/** Load and reuse our self-hosted model. Processing stays in the browser. */
async function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    }).catch((error: unknown) => {
      sessionPromise = null;
      throw error;
    });
  }

  return sessionPromise;
}

/** Prepare a normalized RGB tensor in channel-first order. */
function createInputTensor(image: ImageBitmap): ort.Tensor {
  const canvas = document.createElement("canvas");
  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Unable to create image processing canvas");
  }

  context.drawImage(image, 0, 0, MODEL_SIZE, MODEL_SIZE);
  const pixels = context.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  const pixelCount = MODEL_SIZE * MODEL_SIZE;
  const values = new Float32Array(pixelCount * 3);

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const pixelIndex = pixel * 4;

    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[pixelIndex + channel] / 255;
      values[channel * pixelCount + pixel] = (value - MEAN[channel]) / STD[channel];
    }
  }

  return new ort.Tensor("float32", values, [1, 3, MODEL_SIZE, MODEL_SIZE]);
}

/** Smooth transition between transparent and opaque mask values. */
function smoothstep(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/** Convert the model's prediction into a grayscale opacity mask. */
function createMaskCanvas(prediction: Float32Array): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create segmentation mask");
  }

  const pixelCount = MODEL_SIZE * MODEL_SIZE;
  if (prediction.length < pixelCount) {
    throw new Error("Unexpected segmentation model output");
  }

  let minimum = Infinity;
  let maximum = -Infinity;

  for (let index = 0; index < pixelCount; index++) {
    const value = prediction[index];
    if (!Number.isFinite(value)) {
      throw new Error("Invalid segmentation model output");
    }
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }

  const range = maximum - minimum;
  if (range <= 0) {
    throw new Error("The model could not detect a foreground");
  }

  const imageData = context.createImageData(MODEL_SIZE, MODEL_SIZE);

  for (let index = 0; index < pixelCount; index++) {
    const normalized = (prediction[index] - minimum) / range;
    const opacity = smoothstep(MASK_SOFT_START, MASK_SOLID_START, normalized);
    const intensity = Math.round(opacity * 255);
    const offset = index * 4;

    imageData.data[offset] = intensity;
    imageData.data[offset + 1] = intensity;
    imageData.data[offset + 2] = intensity;
    imageData.data[offset + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Combine the original image with the mask. The resized mask is smoothly
 * interpolated, but we do not blur the whole foreground or its RGB channels.
 */
async function createTransparentImage(image: ImageBitmap, mask: HTMLCanvasElement): Promise<Blob> {
  const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create transparent photograph");
  }

  context.drawImage(image, 0, 0, width, height);

  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = width;
  alphaCanvas.height = height;

  const alphaContext = alphaCanvas.getContext("2d", { willReadFrequently: true });
  if (!alphaContext) {
    throw new Error("Unable to resize the foreground mask");
  }

  alphaContext.imageSmoothingEnabled = true;
  alphaContext.imageSmoothingQuality = "high";
  alphaContext.drawImage(mask, 0, 0, width, height);

  const alphaPixels = alphaContext.getImageData(0, 0, width, height);
  const data = alphaPixels.data;

  for (let index = 0; index < data.length; index += 4) {
    const opacity = data[index];
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = opacity;
  }

  alphaContext.putImageData(alphaPixels, 0, 0);

  context.globalCompositeOperation = "destination-in";
  context.drawImage(alphaCanvas, 0, 0);
  context.globalCompositeOperation = "source-over";

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Unable to export foreground photograph"));
      }
    }, "image/png");
  });
}

/** Remove a photo's background locally, preserving the original File. */
export async function removeBackgroundWithU2Netp(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);

  try {
    const session = await getSession();
    const input = createInputTensor(image);
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const results = await session.run({ [inputName]: input });
    const output = results[outputName];

    if (!output || !(output.data instanceof Float32Array)) {
      throw new Error("Unexpected background-removal response");
    }

    const mask = createMaskCanvas(output.data);
    return await createTransparentImage(image, mask);
  } finally {
    image.close();
  }
}


/** Prefer BiRefNet Lite. Keep U²-Netp if the browser cannot run it. */
export async function removeBackground(file: File): Promise<Blob> {
  try {
    return await removeBackgroundWithBiRefNet(file);
  } catch {
    // The fallback is intentional; both return a transparent PNG Blob.
    document.dispatchEvent(new Event("atelier:background-removal-fallback"));
    return removeBackgroundWithU2Netp(file);
  }
}
