
import type { AtelierState } from "./atelierState";

/**
 * Customer information accepted by our submit-enquiry API.
 */
export interface EnquiryPayload {
    submissionKey: string;
    uploadToken: string;
    customerName: string;
    customerEmail: string;
    customerMessage: string;
    portraitChoices: Record<string, unknown>;
  }

/**
 * Converts Atelier state into data our backend can accept.
 *
 * File objects are deliberately excluded.
 * Photographs will be uploaded separately.
 */
export function createEnquiryPayload(
    state: AtelierState,
    submissionKey: string,
    uploadToken: string,
  ): EnquiryPayload {
    return {
      submissionKey,
      uploadToken,
      customerName: state.enquiry.name.trim(),
    customerEmail: state.enquiry.email.trim(),
    customerMessage: state.enquiry.message.trim(),

    portraitChoices: {
      mode: state.mode,

      numberOfPets: state.portrait.numberOfPets,
      representsRealLifeSizes:
        state.portrait.representsRealLifeSizes,

      subjects: state.portrait.subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        position: subject.position,
        scale: subject.scale,
        rotation: subject.rotation,
        layer: subject.layer,
      })),

      canvas: {
        shape: state.canvas.shape,
        width: state.canvas.width,
        height: state.canvas.height,
        sizeId: state.canvas.sizeId,
      },

      composition: {
        zoom: state.composition.zoom,
        offsetX: state.composition.offsetX,
        offsetY: state.composition.offsetY,
      },

      background: {
        type: state.background.type,
        hasCustomImage:
          state.background.customImage !== null,
      },

      framing: {
        selectedFrame: state.framing.selectedFrame,
      },

      wantsAdvice: state.enquiry.wantsAdvice,
    },
  };
}


/**
 * Response returned after an enquiry is successfully saved.
 */
export interface EnquiryResponse {
    enquiryId: string;
    uploadToken: string;
    uploadExpiresAt: string;
  }
  
  /**
   * Sends an enquiry to our local Supabase Edge Function.
   *
   * Throws an error if the backend cannot save the enquiry.
   */
  export async function submitEnquiry(
    payload: EnquiryPayload,
  ): Promise<EnquiryResponse> {
    const response = await fetch(
      "http://127.0.0.1:54321/functions/v1/submit-enquiry",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
        },
        body: JSON.stringify(payload),
      },
    );
  
    if (!response.ok) {
      throw new Error(
        "Your enquiry could not be sent. Please try again.",
      );
    }
  
    const result: unknown = await response.json();
  
    if (
      typeof result !== "object" ||
      result === null ||
      !("enquiryId" in result) ||
      typeof result.enquiryId !== "string" ||
      !("uploadToken" in result) ||
      typeof result.uploadToken !== "string" ||
      !("uploadExpiresAt" in result) ||
      typeof result.uploadExpiresAt !== "string"
    ) {
      throw new Error("The enquiry service returned an unexpected response.");
    }
  
    return {
      enquiryId: result.enquiryId,
      uploadToken: result.uploadToken,
      uploadExpiresAt: result.uploadExpiresAt,
    };
  }
  