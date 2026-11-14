import { savePhoto } from "../app/photoStorage";
import { atelierState } from "../app/atelierState";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Initialises photograph uploads, previews and drag-and-drop.
 * Files remain in the browser until the customer submits an enquiry.
 */
export function initPhotoUpload(): void {
  const photoInput = document.querySelector<HTMLInputElement>("#pet-photo");
  const uploadLabel = document.querySelector<HTMLElement>(".photo-upload-label");
  const preview = document.querySelector<HTMLElement>("#photo-preview");
  const previewImage = document.querySelector<HTMLImageElement>("#photo-preview-image");
  const changeButton = document.querySelector<HTMLButtonElement>("#change-photo");
  const feedback = document.querySelector<HTMLElement>("#upload-feedback");

  if (!photoInput || !uploadLabel || !preview || !previewImage || !changeButton || !feedback) {
    throw new Error("Photograph upload elements not found");
  }

  let previewUrl: string | null = null;

  /**
   * Validates and displays a selected photograph.
   * Shared by file-picker and drag-and-drop interactions.
   */
  function handlePhoto(file: File): void {
    if (!ALLOWED_TYPES.includes(file.type)) {
      feedback.textContent = "Please choose a JPG, PNG or WebP photograph.";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      feedback.textContent = "Please choose a photograph smaller than 15 MB.";
      return;
    }

    const newUrl = URL.createObjectURL(file);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    previewUrl = newUrl;
    atelierState.portrait.photo = file;
    void savePhoto(file).catch(() => {
      feedback!.textContent =
        "Your photograph is ready, but it couldn't be saved for a future visit.";
    });

    previewImage!.src = previewUrl;
    uploadLabel!.hidden = true;
    preview!.hidden = false;

    feedback!.textContent = "Photograph added successfully.";
  }

  // Choose a photograph by clicking or tapping.
  photoInput.addEventListener("change", () => {
    const file = photoInput.files?.[0];

    if (file) {
      handlePhoto(file);
    }
  });

  // Prevent the browser from opening the dropped file.
  uploadLabel.addEventListener("dragover", (event: DragEvent) => {
    event.preventDefault();
    uploadLabel.classList.add("is-dragging");
  });

  uploadLabel.addEventListener("dragleave", () => {
    uploadLabel.classList.remove("is-dragging");
  });

  // Handle a photograph dropped onto the upload area.
  uploadLabel.addEventListener("drop", (event: DragEvent) => {
    event.preventDefault();
    uploadLabel.classList.remove("is-dragging");

    const file = event.dataTransfer?.files[0];

    if (file) {
      handlePhoto(file);
    }
  });

  /**
   * Restores the photograph preview when returning
   * to the upload screen.
   */
  function restorePhotoPreview(): void {
    const savedPhoto = atelierState.portrait.photo;

    if (!savedPhoto) return;

    if (!previewUrl) {
      previewUrl = URL.createObjectURL(savedPhoto);
    }

    previewImage!.src = previewUrl;
    uploadLabel!.hidden = true;
    preview!.hidden = false;
  }

  document.addEventListener("atelier:photo-screen-opened", restorePhotoPreview);

  // Allow customers to replace their photograph.
  changeButton.addEventListener("click", () => {
    photoInput.value = "";
    photoInput.click();
  });
}
