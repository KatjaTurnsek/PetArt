import { atelierState } from "../app/atelierState";
import { drawPictureFrame, type FrameStyle } from "../app/frameRendererV2";
import { getFramePreviewThickness } from "../app/frameDefinitions";

const FRAME_LABELS: Record<string, string> = {
  rustic: "Rustic wood",
  "antique-gold": "Antique gold",
  "natural-wood": "Natural wood",
};

function setText(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function currentAspectRatio(): number {
  const { width, height, shape } = atelierState.canvas;
  if (width && height) return width / height;
  return shape === "landscape" ? 1.25 : shape === "square" ? 1 : 0.8;
}

/**
 * Create a fresh portrait preview from the same live composition used by Step 4.
 * Unlike copying Step 5's canvas, this works when Step 5 was never displayed
 * during this page load (for example, when refreshing directly on Step 7).
 */
function snapshotArtwork(): HTMLElement | null {
  const screen = document.querySelector<HTMLElement>("#background-screen");
  const source = document.querySelector<HTMLElement>("#background-live-preview");
  if (!screen || !source) return null;

  const wasHidden = screen.hidden;
  const formerStyle = screen.getAttribute("style");
  const previousWidth = source.style.width;
  try {
    // Allow Step 4 to compute its layout offscreen without exposing it to users.
    screen.hidden = false;
    screen.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;visibility:hidden;pointer-events:none;";
    source.style.width = "420px";
    document.dispatchEvent(new Event("atelier:background-screen-opened"));
    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.querySelectorAll<HTMLElement>("[id]").forEach((node) => node.removeAttribute("id"));
    clone.classList.remove("is-background-draggable");
    clone.style.width = "100%";
    clone.style.maxWidth = "none";
    clone.style.margin = "0";
    clone.style.borderRadius = "0";
    clone.style.aspectRatio = String(currentAspectRatio());
    return clone;
  } finally {
    source.style.width = previousWidth;
    if (formerStyle === null) screen.removeAttribute("style");
    else screen.setAttribute("style", formerStyle);
    screen.hidden = wasHidden;
  }
}

let renderVersion = 0;

async function renderArtworkPreview(): Promise<void> {
  const version = ++renderVersion;
  const destination = document.querySelector<HTMLElement>("#summary-artwork-preview");
  if (!destination) return;

  if (!atelierState.portrait.subjects.length && !atelierState.portrait.photo) {
    destination.textContent = "Your portrait preview will appear when your photograph is ready.";
    return;
  }

  const artwork = snapshotArtwork();
  if (!artwork) {
    destination.textContent = "Your portrait preview is not available yet.";
    return;
  }

  // The preview has its own geometry and frame canvas. It never depends on
  // whether the hidden Step 5 canvas has been rendered since a page refresh.
  const width = 420;
  const height = width / currentAspectRatio();
  const stage = document.createElement("div");
  stage.className = "summary-render-stage";
  stage.style.aspectRatio = `${width} / ${height}`;
  const holder = document.createElement("div");
  holder.className = "summary-render-artwork";
  holder.append(artwork);
  stage.append(holder);
  destination.replaceChildren(stage);

  const selected = atelierState.framing.selectedFrame;
  if (!selected || !(selected in FRAME_LABELS)) return;

  const style = selected as FrameStyle;
  const thickness = getFramePreviewThickness(style, width);
  const frame = document.createElement("canvas");
  frame.className = "summary-render-frame";
  const drawingWidth = width + thickness * 2;
  const drawingHeight = height + thickness * 2;
  try {
    await drawPictureFrame(frame, style, drawingWidth, drawingHeight, thickness);
    if (version !== renderVersion || !stage.isConnected) return;
    const image = document.createElement("img");
    image.className = "summary-render-frame";
    image.alt = "";
    image.src = frame.toDataURL("image/png");
    image.style.left = `${(-thickness / width) * 100}%`;
    image.style.top = `${(-thickness / height) * 100}%`;
    image.style.width = `${(drawingWidth / width) * 100}%`;
    image.style.height = `${(drawingHeight / height) * 100}%`;
    stage.append(image);
  } catch {
    // The unframed artwork remains visible if a decorative asset cannot load.
    if (version === renderVersion) {
      const note = document.querySelector<HTMLElement>("#summary-frame-note");
      if (note) note.textContent = "The selected decorative frame could not be displayed. Framing is not included or currently offered.";
    }
  }
}

function updateSummary(): void {
  const { canvas, framing, background, portrait } = atelierState;
  setText("#summary-size", canvas.width && canvas.height
    ? `${canvas.width} × ${canvas.height} cm` : "Not yet selected");
  setText("#summary-shape", canvas.shape[0].toUpperCase() + canvas.shape.slice(1));
  const selectedFrame = framing.selectedFrame;
  setText("#summary-frame", selectedFrame ? (FRAME_LABELS[selectedFrame] ?? selectedFrame) : "No frame");
  setText("#summary-frame-note", selectedFrame
    ? "Frame shown for inspiration only. Framing is not included or currently offered."
    : "Gallery-wrapped canvas. Decorative framing is not included or currently offered.");
  const selectedBackground = document.querySelector<HTMLElement>(
    ".background-option.is-selected .background-option-copy strong, .background-option[aria-pressed='true'] .background-option-copy strong"
  );
  setText("#summary-background", selectedBackground?.textContent?.trim() ||
    (background.type === "blurred" ? "Softened background" :
      background.type === "neutral" ? "Neutral background" :
        background.type === "custom" ? "Personal background" : "Original photograph"));
  const count = portrait.numberOfPets || portrait.subjects.length;
  setText("#summary-pets", count ? `${count} ${count === 1 ? "pet" : "pets"}` : "Your selected photograph(s)");
  void renderArtworkPreview();
}

/** A scheduled refresh also handles pets restored asynchronously from IndexedDB. */
export function initPortraitSummary(): void {
  let queued = false;
  function scheduleIfVisible(): void {
    if (atelierState.currentStep !== 7 || queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (atelierState.currentStep === 7) updateSummary();
    });
  }
  document.addEventListener("atelier:summary-screen-opened", updateSummary);
  document.addEventListener("atelier:subjects-changed", scheduleIfVisible);
  document.addEventListener("atelier:cutout-ready", scheduleIfVisible);
  document.addEventListener("atelier:frame-changed", scheduleIfVisible);
}
