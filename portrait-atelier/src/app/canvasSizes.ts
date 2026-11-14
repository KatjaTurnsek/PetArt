/**
 * Canvas dimensions are stored in centimetres.
 * All prices are in EUR.
 */

export type CanvasShape = "portrait" | "landscape" | "square";

export interface CanvasSize {
  id: string;
  width: number;
  height: number;
  price: number;
  maxPets?: number;
  description: string;
  estimated?: boolean;
}

/**
 * Published Pet Art with Heart canvas sizes.
 */
export const canvasSizes: CanvasSize[] = [
  {
    id: "30x25",
    width: 30,
    height: 25,
    price: 1100,
    maxPets: 1,
    description: "A close-up portrait of one pet.",
  },
  {
    id: "40x30",
    width: 40,
    height: 30,
    price: 1450,
    maxPets: 1,
    description: "More room for a single pet.",
  },
  {
    id: "45x35",
    width: 45,
    height: 35,
    price: 1800,
    maxPets: 1,
    description: "A larger composition with one pet.",
  },
  {
    id: "50x40",
    width: 50,
    height: 40,
    price: 2150,
    description: "Space for one or more pets.",
  },
  {
    id: "60x45",
    width: 60,
    height: 45,
    price: 2600,
    description: "More room for full-body or multiple pets.",
  },
];

/**
 * Proposed square canvas prices.
 * Confirm these prices before publishing.
 */
export const squareCanvasSizes: CanvasSize[] = [
  {
    id: "30x30",
    width: 30,
    height: 30,
    price: 1250,
    maxPets: 1,
    description: "A compact square portrait of one pet.",
    estimated: true,
  },
  {
    id: "40x40",
    width: 40,
    height: 40,
    price: 1850,
    maxPets: 1,
    description: "A balanced square portrait of one pet.",
    estimated: true,
  },
  {
    id: "50x50",
    width: 50,
    height: 50,
    price: 2500,
    description: "A generous square composition.",
    estimated: true,
  },
  {
    id: "60x60",
    width: 60,
    height: 60,
    price: 3200,
    description: "A statement portrait with plenty of space.",
    estimated: true,
  },
];

/**
 * Returns dimensions in the selected orientation.
 */
export function getOrientedDimensions(
  size: CanvasSize,
  shape: CanvasShape
): { width: number; height: number } {
  if (shape === "square") {
    return {
      width: size.width,
      height: size.height,
    };
  }

  const shorterSide = Math.min(size.width, size.height);
  const longerSide = Math.max(size.width, size.height);

  return shape === "portrait"
    ? { width: shorterSide, height: longerSide }
    : { width: longerSide, height: shorterSide };
}

/**
 * Checks whether a size suits the number of pets.
 */
export function supportsPetCount(size: CanvasSize, numberOfPets: number): boolean {
  return size.maxPets === undefined || numberOfPets <= size.maxPets;
}
