import * as ort from "onnxruntime-web";

const MODEL_URL = "/models/u2netp.onnx";
const MODEL_SIZE = 320;
const MAX_OUTPUT_DIMENSION = 1600;
const MASK_THRESHOLD = 0.08;
const MASK_GAMMA = 1.15;
const MASK_FEATHER_BLUR = 1.4;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let sessionPromise: Promise<ort.InferenceSession> | null = null;

/**
 * Load and reuse our self-hosted U2-Netp model.
 * All inference runs in the customer's browser.
 */
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

/**
 * Prepare a photograph as a normalized RGB tensor.
 */
function createInputTensor(image: ImageBitmap): ort.Tensor {
  const canvas = document.createElement("canvas");
  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;

  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error("Unable to create image processing canvas");
  }

  context.drawImage(image, 0, 0, MODEL_SIZE, MODEL_SIZE);

  const pixels = context.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;

  const pixelCount = MODEL_SIZE * MODEL_SIZE;
  const values = new Float32Array(pixelCount * 3);

  // Convert RGBA pixels to normalized RGB, channel first.
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const pixelIndex = pixel * 4;

    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[pixelIndex + channel] / 255;

      values[channel * pixelCount + pixel] = (value - MEAN[channel]) / STD[channel];
    }
  }

  return new ort.Tensor("float32", values, [1, 3, MODEL_SIZE, MODEL_SIZE]);
}

/**
 * Convert the model's prediction to a grayscale mask.
 */
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
    const normalized = Math.max(0, Math.min(1, (prediction[index] - minimum) / range));

    // Tighten the mask a little so more background is removed.
    const thresholded = Math.max(0, (normalized - MASK_THRESHOLD) / (1 - MASK_THRESHOLD));

    // Gentle curve to keep the subject natural.
    const adjusted = Math.pow(thresholded, MASK_GAMMA);

    const intensity = Math.round(adjusted * 255);
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
 * Combine the original photograph with the predicted
 * foreground mask, preserving transparent areas.
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

  // Resize the mask to the output size.
  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = width;
  alphaCanvas.height = height;

  const alphaContext = alphaCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!alphaContext) {
    throw new Error("Unable to resize the foreground mask");
  }

  alphaContext.imageSmoothingEnabled = true;
  alphaContext.imageSmoothingQuality = "high";
  alphaContext.drawImage(mask, 0, 0, width, height);

  // Feather the mask slightly so the pet edge looks softer.
  const featherCanvas = document.createElement("canvas");
  featherCanvas.width = width;
  featherCanvas.height = height;

  const featherContext = featherCanvas.getContext("2d");

  if (!featherContext) {
    throw new Error("Unable to feather the foreground mask");
  }

  featherContext.filter = `blur(${MASK_FEATHER_BLUR}px)`;
  featherContext.drawImage(alphaCanvas, 0, 0);

  const alphaPixels = featherContext.getImageData(0, 0, width, height);

  for (let index = 0; index < alphaPixels.data.length; index += 4) {
    alphaPixels.data[index + 3] = alphaPixels.data[index];
    alphaPixels.data[index] = 255;
    alphaPixels.data[index + 1] = 255;
    alphaPixels.data[index + 2] = 255;
  }

  featherContext.putImageData(alphaPixels, 0, 0);

  context.globalCompositeOperation = "destination-in";
  context.drawImage(featherCanvas, 0, 0);
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

/**
 * Remove a photograph's background locally.
 *
 * Returns a PNG Blob with transparency.
 * The original photograph is never modified.
 */
export async function removeBackground(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);

  try {
    const session = await getSession();
    const input = createInputTensor(image);

    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const results = await session.run({
      [inputName]: input,
    });

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
