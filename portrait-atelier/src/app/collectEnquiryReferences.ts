import type { AtelierState } from "./atelierState";
import { isUsingExamplePhotos } from "../screens/photoUpload";
import type { ReferenceType } from "./referenceUploadApi";

export interface EnquiryReference {
  file: File;
  type: ReferenceType;
}

/**
 * Collects original customer photographs for an enquiry.
 *
 * Excludes demo images, room photographs and generated previews.
 */
export function collectEnquiryReferences(
  state: AtelierState,
): EnquiryReference[] {
  const references: EnquiryReference[] = [];

  // Demo photographs are for exploration, not submission.
  if (isUsingExamplePhotos()) {
    return references;
  }

  for (const subject of state.portrait.subjects) {
    references.push({
      file: subject.photo,
      type: "pet",
    });

    for (const photo of subject.referencePhotos) {
      references.push({
        file: photo,
        type: "pet",
      });
    }
  }

  if (state.background.customImage) {
    references.push({
      file: state.background.customImage,
      type: "background",
    });
  }

  if (state.enquiry.additionalBackground) {
    references.push({
      file: state.enquiry.additionalBackground,
      type: "background",
    });
  }

  return references;
}
