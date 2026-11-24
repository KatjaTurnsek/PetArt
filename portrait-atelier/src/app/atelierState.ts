/**
 * Portrait Atelier — Application State.
 * Preserve existing single-photo state during the multi-pet migration.
 */

export type CanvasShape = "portrait" | "landscape" | "square";

export type AtelierMode = "create" | "guided";

export interface PortraitSubject {
  id: string;
  name: string;
  photo: File;
  referencePhotos: File[];
  /** Normalised position on the future composition canvas (0–1). */
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  layer: number;
}

export interface AtelierState {
  currentStep: number;
  mode: AtelierMode;
  portrait: {
    /** Compatibility with current single-photo visualisers. */
    photo: File | null;
    numberOfPets: number | null;
    subjects: PortraitSubject[];
    representsRealLifeSizes: boolean | null;
  };
  canvas: {
    shape: CanvasShape;
    width: number | null;
    height: number | null;
    sizeId: string | null;
  };
  composition: { zoom: number; offsetX: number; offsetY: number };
  background: {
    type: "original" | "blurred" | "neutral" | "custom";
    customImage: File | null;
  };
  framing: { selectedFrame: string | null };
  room: {
    image: File | null;
    positionX: number;
    positionY: number;
    scale: number;
  };
  enquiry: {
    name: string;
    email: string;
    message: string;
    wantsAdvice: boolean;
    /** Optional extra scenery reference supplied at the enquiry stage. */
    additionalBackground: File | null;
  };
}

export const atelierState: AtelierState = {
  currentStep: 1,
  mode: "create",
  portrait: {
    photo: null,
    numberOfPets: null,
    subjects: [],
    representsRealLifeSizes: null,
  },
  canvas: { shape: "portrait", width: null, height: null, sizeId: null },
  composition: { zoom: 1, offsetX: 0, offsetY: 0 },
  background: { type: "original", customImage: null },
  framing: { selectedFrame: null },
  room: { image: null, positionX: 0, positionY: 0, scale: 1 },
  enquiry: { name: "", email: "", message: "", wantsAdvice: false, additionalBackground: null },
};

export function createPortraitSubject(photo: File, name = ""): PortraitSubject {
  return {
    id: crypto.randomUUID(),
    name,
    photo,
    referencePhotos: [],
    position: { x: 0.5, y: 0.5 },
    scale: 1,
    rotation: 0,
    layer: atelierState.portrait.subjects.length,
  };
}

export function addPortraitSubject(photo: File, name = ""): PortraitSubject {
  const subject = createPortraitSubject(photo, name);
  atelierState.portrait.subjects.push(subject);
  atelierState.portrait.numberOfPets = atelierState.portrait.subjects.length;
  return subject;
}

export function removePortraitSubject(id: string): void {
  atelierState.portrait.subjects = atelierState.portrait.subjects.filter(
    (subject) => subject.id !== id
  );
  atelierState.portrait.numberOfPets = atelierState.portrait.subjects.length;
}
