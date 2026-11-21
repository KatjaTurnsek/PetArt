import { atelierState } from "../app/atelierState";
import { drawPictureFrame, type FrameStyle } from "../app/frameRenderer";

const FRAME_STORAGE_KEY = "portrait-atelier-frame-v1";
const FRAME_STYLES: FrameStyle[] = ["none", "rustic", "antique-gold", "natural-wood"];

/** Step 5: frame-only visualisation. Frame assets are never included in portrait uploads. */
export function initFrameSelection(): void {
  const previewHost = document.querySelector<HTMLElement>("#frame-visualiser");
  const artworkHost = document.querySelector<HTMLElement>("#frame-artwork");
  const stage = document.querySelector<HTMLElement>("#frame-stage");
  const canvas = document.querySelector<HTMLCanvasElement>("#frame-overlay");
  const status = document.querySelector<HTMLElement>("#frame-feedback");
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-frame-style]"));
  if (!previewHost || !artworkHost || !stage || !canvas || !status || buttons.length !== 4) {
    throw new Error("Frame selection elements not found.");
  }

  const elements = { previewHost, artworkHost, stage, canvas, status };
  let selected: FrameStyle = "none";
  let drawId = 0;
  let scheduledDraw = 0;
  let lastDrawKey = "";

  // State already has a framing.selectedFrame field. The saved choice is also stored
  // separately because existing Atelier choice storage may not yet cover Step 5.
  try {
    const saved = window.localStorage.getItem(FRAME_STORAGE_KEY);
    if (saved && FRAME_STYLES.includes(saved as FrameStyle)) selected = saved as FrameStyle;
  } catch { /* Browsers may block storage in privacy mode. */ }
  const currentChoice = atelierState.framing.selectedFrame;
  if (currentChoice && FRAME_STYLES.includes(currentChoice as FrameStyle)) {
    selected = currentChoice as FrameStyle;
  }
  atelierState.framing.selectedFrame = selected === "none" ? null : selected;

  function cloneBackgroundPreview(): void {
    const source = document.querySelector<HTMLElement>("#background-live-preview");
    if (!source) {
      elements.status.textContent = "Choose your background in Step 4 first.";
      return;
    }
    // Clone the already prepared layered preview. This preserves graduated blur,
    // scenery transformations, backgrounds, transparent pets and ground shadows.
    // Do not copy IDs: the live Step 4 view must remain the only target of its controls.
    const clone = source.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLElement>("[id]").forEach((node) => node.removeAttribute("id"));
    clone.removeAttribute("id");
    clone.classList.remove("is-background-draggable");
    clone.style.width = "100%";
    clone.style.maxWidth = "none";
    clone.style.height = "auto";
    clone.style.margin = "0";
    clone.style.aspectRatio = source.style.aspectRatio || "4 / 5";
    // Fit the complete painting (including its frame) within the visible viewport.
    // The width is recalculated by CSS when the canvas shape or screen size changes.
    const canvasRatio = Number(source.style.aspectRatio) ||
      (atelierState.canvas.width && atelierState.canvas.height
        ? atelierState.canvas.width / atelierState.canvas.height
        : atelierState.canvas.shape === "landscape" ? 1.25
          : atelierState.canvas.shape === "square" ? 1 : 0.8);
    elements.stage.style.setProperty(
      "--frame-artwork-ratio",
      String(Math.min(4, Math.max(0.25, canvasRatio))),
    );
    clone.setAttribute("aria-label", "Your portrait composition");
    elements.artworkHost.replaceChildren(clone);
    lastDrawKey = ""; // The composition changed; redraw the frame on re-entry.
  }

  async function drawFrame(): Promise<void> {
    const current = ++drawId;
    const stageWidth = elements.stage.clientWidth;
    if (stageWidth < 1) return;
    const thickness = selected === "none" ? 0 : Math.max(10, Math.min(36, Math.round(stageWidth * 0.075)));
    elements.stage.style.setProperty("--frame-thickness", `${thickness}px`);
    elements.stage.classList.toggle("has-frame", selected !== "none");
    elements.canvas.hidden = selected === "none";
    const width = elements.stage.clientWidth;
    const height = elements.stage.clientHeight;
    if (width < 1 || height < 1) return;
    const drawKey = `${selected}:${Math.round(width)}:${Math.round(height)}:${thickness}`;
    if (drawKey === lastDrawKey) return;
    lastDrawKey = drawKey;
    try {
      await drawPictureFrame(elements.canvas, selected, width, height, thickness);
      if (current !== drawId) return;
      elements.status.textContent = selected === "none"
        ? "Gallery-wrapped canvas without a decorative frame."
        : "Frame preview only — framing is not currently available to order.";
    } catch {
      if (current !== drawId) return;
      lastDrawKey = ""; // Allow a retry after a temporary image-loading failure.
      elements.status.textContent = "The frame preview could not load. Your portrait is unaffected.";
    }
  }

  function renderSelection(): void {
    for (const button of buttons) {
      const active = button.dataset.frameStyle === selected;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", String(active));
    }
    scheduleFrame();
  }

  function scheduleFrame(): void {
    if (scheduledDraw) cancelAnimationFrame(scheduledDraw);
    scheduledDraw = requestAnimationFrame(() => {
      scheduledDraw = 0;
      void drawFrame();
    });
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const next = button.dataset.frameStyle;
      if (!next || !FRAME_STYLES.includes(next as FrameStyle)) return;
      selected = next as FrameStyle;
      atelierState.framing.selectedFrame = selected === "none" ? null : selected;
      try { window.localStorage.setItem(FRAME_STORAGE_KEY, selected); } catch { /* optional */ }
      renderSelection();
    });
  }

  // Existing step navigation calls this when Step 5 opens (see README).
  document.addEventListener("atelier:frame-screen-opened", () => {
    cloneBackgroundPreview();
    renderSelection();
  });

  const observer = new ResizeObserver(scheduleFrame);
  observer.observe(elements.previewHost);
  observer.observe(elements.stage);
  // Background Step 4 remains authoritative; refresh our clone on re-entry.
  // This avoids reprocessing the pet or background in the frame-selection step.
  cloneBackgroundPreview();
  renderSelection();
}
