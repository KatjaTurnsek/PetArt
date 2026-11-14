import { atelierState } from "../app/atelierState";

let photoUrl: string | null = null;

/**
 * Displays the customer's photograph inside
 * the three canvas-shape previews.
 */
export function updateCanvasPreviews(): void {
  const photo = atelierState.portrait.photo;

  const canvasOutlines = document.querySelectorAll<HTMLElement>(".canvas-outline");

  // Clear previous previews.
  canvasOutlines.forEach((outline) => {
    outline.replaceChildren();
  });

  if (photoUrl) {
    URL.revokeObjectURL(photoUrl);
    photoUrl = null;
  }

  if (!photo) return;

  // One temporary URL shared by all three previews.
  photoUrl = URL.createObjectURL(photo);

  canvasOutlines.forEach((outline) => {
    const image = document.createElement("img");

    image.src = photoUrl!;
    image.alt = "";
    image.className = "canvas-preview-image";

    outline.appendChild(image);
  });
}
