/**
 * Remove the foreground silhouette from a blurred copy of the source photo.
 * The original (sharp) photograph stays underneath this transparent overlay.
 * This prevents the blurred source animal showing through behind its cutout.
 *
 * Runs only when a new (photo, cutout, blur preset) combination is prepared.
 */
export async function maskSubjectFromBlur(
  blurredUrl: string,
  cutoutUrl: string,
): Promise<string> {
  const [blurredBlob, cutoutBlob] = await Promise.all([
    fetch(blurredUrl).then((response) => {
      if (!response.ok) throw new Error("Unable to load blurred background");
      return response.blob();
    }),
    fetch(cutoutUrl).then((response) => {
      if (!response.ok) throw new Error("Unable to load pet cutout");
      return response.blob();
    }),
  ]);
  const [blurred, cutout] = await Promise.all([
    createImageBitmap(blurredBlob),
    createImageBitmap(cutoutBlob),
  ]);

  try {
    // The preview is displayed at a few hundred pixels; avoid processing
    // multi-megapixel textures and blocking clicks unnecessarily.
    const maxSide = 1200;
    const scale = Math.min(1, maxSide / Math.max(blurred.width, blurred.height));
    const width = Math.max(1, Math.round(blurred.width * scale));
    const height = Math.max(1, Math.round(blurred.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare foreground mask");

    context.drawImage(blurred, 0, 0, width, height);
    // Transparent portions of the cutout have alpha zero; the dog itself is
    // opaque. destination-out removes the dog from the *blurred* layer only.
    context.globalCompositeOperation = "destination-out";
    context.drawImage(cutout, 0, 0, width, height);
    context.globalCompositeOperation = "source-over";

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Unable to save masked background")),
        "image/webp",
        0.87,
      );
    });
    return URL.createObjectURL(blob);
  } finally {
    blurred.close();
    cutout.close();
  }
}
