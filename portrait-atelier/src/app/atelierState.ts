/**
 * Portrait Atelier — Application State
 *
 * Stores the customer's choices throughout
 * the portrait planning experience.
 */

export interface AtelierState {
  currentStep: number;

  portrait: {
    photo: File | null;
    numberOfPets: number | null;
  };

  canvas: {
    shape: "portrait" | "landscape" | "square";
    width: number | null;
    height: number | null;
    sizeId: string | null;
  };

  composition: {
    zoom: number;
    offsetX: number;
    offsetY: number;
  };

  background: {
    type: "original" | "blurred" | "neutral" | "custom";
    customImage: File | null;
  };

  framing: {
    selectedFrame: string | null;
  };

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
  };
}

/**
 * Initial state for a new Portrait Atelier session.
 */
export const atelierState: AtelierState = {
  currentStep: 1,

  portrait: {
    photo: null,
    numberOfPets: null,
  },

  canvas: {
    shape: "portrait",
    width: null,
    height: null,
    sizeId: null,
  },

  composition: {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  },

  background: {
    type: "original",
    customImage: null,
  },

  framing: {
    selectedFrame: null,
  },

  room: {
    image: null,
    positionX: 0,
    positionY: 0,
    scale: 1,
  },

  enquiry: {
    name: "",
    email: "",
    message: "",
    wantsAdvice: false,
  },
};
