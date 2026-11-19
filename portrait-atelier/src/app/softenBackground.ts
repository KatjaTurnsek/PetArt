/**
 * Prepare a softly blurred photograph at source-image resolution.
 *
 * CSS blur(6px) works in displayed pixels. On a 400px preview it looks
 * stronger than applying blur(6px) to a high-resolution photograph and
 * then scaling that photograph down. This function restores the latter.
 *
 * The original File is never modified, uploaded or replaced in storage.
 */
const SOURCE_BLUR_PX = 6;
const MAX_PROCESSING_EDGE = 2400;

export async function softenBackground(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);

  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    if (longestEdge <= 0) {
      throw new Error("Invalid background photograph dimensions.");
    }

    const resolutionScale = Math.min(1, MAX_PROCESSING_EDGE / longestEdge);
    const width = Math.max(1, Math.round(bitmap.width * resolutionScale));
    const height = Math.max(1, Math.round(bitmap.height * resolutionScale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Cannot create a background-processing canvas.");
    }

    // Apply exactly 6px at this processing resolution, not at display size.
    // Overdraw slightly to avoid transparent edges introduced by the filter.
    const bleed = SOURCE_BLUR_PX * 3;
    context.filter = `blur(${SOURCE_BLUR_PX}px)`;
    context.drawImage(
      bitmap,
      -bleed,
      -bleed,
      width + bleed * 2,
      height + bleed * 2,
    );
    context.filter = "none";

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Could not export the softened background."));
      }, "image/jpeg", 0.9);
    });

    return URL.createObjectURL(blob);
  } finally {
    bitmap.close();
  }
}
