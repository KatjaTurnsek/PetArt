import { canvasSizes } from "./canvasSizes";

/**
 * Calculates an estimated price for bespoke canvas dimensions.
 *
 * Uses the published Pet Art with Heart prices as reference
 * points and interpolates according to canvas area.
 *
 * Prices are rounded to the nearest €50.
 * All dimensions are in centimetres.
 */

export function calculateCustomPrice(width: number, height: number): number | null {
  // Prevent invalid dimensions.
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 10 ||
    height < 10 ||
    width > 200 ||
    height > 200
  ) {
    return null;
  }

  const area = width * height;

  // Build reference points using published prices.
  const referencePrices = canvasSizes
    .map((size) => ({
      area: size.width * size.height,
      price: size.price,
    }))
    .sort((a, b) => a.area - b.area);

  // Find the two nearest reference points.
  let lower = referencePrices[0];
  let upper = referencePrices[1];

  for (let i = 1; i < referencePrices.length; i++) {
    if (area <= referencePrices[i].area) {
      lower = referencePrices[i - 1];
      upper = referencePrices[i];
      break;
    }

    // For larger canvases, extrapolate from the last two sizes.
    if (i === referencePrices.length - 1) {
      lower = referencePrices[i - 1];
      upper = referencePrices[i];
    }
  }

  // Linear interpolation based on canvas area.
  const progress = (area - lower.area) / (upper.area - lower.area);

  const estimate = lower.price + progress * (upper.price - lower.price);

  // Round to nearest €50.
  return Math.max(50, Math.round(estimate / 50) * 50);
}
