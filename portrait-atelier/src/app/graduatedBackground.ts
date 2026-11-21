/** Render blur once against source-resolution pixels, not against the small preview. */
export type BlurStrength = "soft" | "natural" | "dreamy";

const RADIUS: Record<BlurStrength, number> = {
  soft: 5,
  natural: 14,
  dreamy: 30,
};

export async function makeBlurredBackground(file: File, strength: BlurStrength): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    // A reasonable cap avoids excessive memory on large phone photographs.
    const MAX_SIDE = 1600; // Preview-quality texture: substantially less memory than 2400px.
    const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable.");
    // Radius is expressed in source-image pixels, then scaled to the output.
    const blur = RADIUS[strength] * ratio;
    context.filter = `blur(${blur.toFixed(2)}px)`;
    // Extend the pixels slightly beyond the edges to avoid a light transparent seam.
    const bleed = Math.ceil(blur * 2.5);
    context.drawImage(bitmap, -bleed, -bleed, width + 2 * bleed, height + 2 * bleed);
    context.filter = "none";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not prepare background.")), "image/jpeg", 0.92);
    });
    return URL.createObjectURL(blob);
  } finally {
    bitmap.close();
  }
}
