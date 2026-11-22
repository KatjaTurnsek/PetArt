import { atelierState } from "../app/atelierState";

const FRAME_LABELS: Record<string, string> = {
  "rustic": "Rustic Wood",
  "antique-gold": "Antique Gold",
  "natural-wood": "Natural Wood",
};

function setText(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

/** Present the existing frame preview without editing its original canvas or controls. */
function updateArtworkPreview(): void {
  const destination = document.querySelector<HTMLElement>("#summary-artwork-preview");
  const original = document.querySelector<HTMLElement>("#frame-stage");
  if (!destination || !original) return;

  const originalArtwork = original.querySelector<HTMLElement>("#frame-artwork");
  if (!originalArtwork || !originalArtwork.children.length) {
    destination.textContent = "Your portrait preview will appear once the composition is ready.";
    return;
  }

  const copy = original.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.querySelectorAll<HTMLElement>("[id]").forEach((element) => element.removeAttribute("id"));
  copy.querySelectorAll<HTMLCanvasElement>("canvas").forEach((newCanvas, index) => {
    const from = original.querySelectorAll<HTMLCanvasElement>("canvas")[index];
    if (!from) return;
    newCanvas.width = from.width;
    newCanvas.height = from.height;
    const context = newCanvas.getContext("2d");
    if (context && from.width && from.height) context.drawImage(from, 0, 0);
  });
  // The hidden Step 5 screen is not measurable. Keep its known artwork ratio.
  copy.style.width = "min(100%, 440px)";
  destination.replaceChildren(copy);
}

function updateSummary(): void {
  const { canvas, framing, background, portrait } = atelierState;
  const width = canvas.width;
  const height = canvas.height;
  setText("#summary-size", width && height ? `${width} × ${height} cm` : "Not yet selected");
  setText("#summary-shape", canvas.shape[0].toUpperCase() + canvas.shape.slice(1));
  const selectedFrame = framing.selectedFrame;
  setText("#summary-frame", selectedFrame ? (FRAME_LABELS[selectedFrame] ?? selectedFrame) : "No frame");
  // Read the visible selected background when available, since its fine-tune preference
  // is handled within the background screen rather than the shared state object.
  const selectedBackground = document.querySelector<HTMLElement>(".background-option.is-selected .background-option-copy strong, .background-option[aria-pressed='true'] .background-option-copy strong");
  setText("#summary-background", selectedBackground?.textContent?.trim() || (background.type === "blurred" ? "Softened background" : background.type === "neutral" ? "Neutral background" : background.type === "custom" ? "Personal background" : "Original photograph"));
  setText("#summary-pets", portrait.numberOfPets ? `${portrait.numberOfPets} ${portrait.numberOfPets === 1 ? "pet" : "pets"}` : "Your selected photograph(s)");
  updateArtworkPreview();
}

/** Read-only review stage. Does not alter any painting, framing or room settings. */
export function initPortraitSummary(): void {
  document.addEventListener("atelier:summary-screen-opened", updateSummary);
  document.addEventListener("atelier:cutout-ready", () => {
    if (atelierState.currentStep === 7) updateSummary();
  });
}
