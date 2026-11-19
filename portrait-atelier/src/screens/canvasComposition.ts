import { initMultiPetComposition } from "./multiPetComposition";
import { atelierState } from "../app/atelierState";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * Keeps a number within a defined range.
 */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Allows customers to drag and zoom their photograph
 * inside the selected canvas.
 */
export function initCanvasComposition(): void {
  const preview = document.querySelector<HTMLElement>("#size-preview-second");

  const controls = document.querySelector<HTMLElement>("#canvas-composition-controls");

  const zoomSlider = document.querySelector<HTMLInputElement>("#composition-zoom");

  const zoomValue = document.querySelector<HTMLOutputElement>("#composition-zoom-value");

  const resetButton = document.querySelector<HTMLButtonElement>("#composition-reset");

  if (!preview || !controls || !zoomSlider || !zoomValue || !resetButton) {
    throw new Error("Canvas composition controls not found");
  }

  const composition = atelierState.composition;

  const elements = {
    preview,
    controls,
    zoomSlider,
    zoomValue,
    resetButton,
  };

  let activeImage: HTMLImageElement | null = null;

  let dragging = false;

  let dragStartX = 0;
  let dragStartY = 0;

  let initialOffsetX = 0;
  let initialOffsetY = 0;

  /**
   * Finds the photograph currently displayed
   * inside the selected canvas.
   */
  function getImage(): HTMLImageElement | null {
    return elements.preview.querySelector<HTMLImageElement>(".size-preview-image");
  }

  /**
   * Calculates the minimum dimensions needed
   * to cover the canvas, including zoom.
   */
  function getImageDimensions(image: HTMLImageElement): { width: number; height: number } | null {
    const canvasWidth = elements.preview.clientWidth;

    const canvasHeight = elements.preview.clientHeight;

    if (
      canvasWidth <= 0 ||
      canvasHeight <= 0 ||
      image.naturalWidth <= 0 ||
      image.naturalHeight <= 0
    ) {
      return null;
    }

    const coverScale = Math.max(
      canvasWidth / image.naturalWidth,
      canvasHeight / image.naturalHeight
    );

    const zoom = clamp(Number(composition.zoom) || MIN_ZOOM, MIN_ZOOM, MAX_ZOOM);

    return {
      width: image.naturalWidth * coverScale * zoom,

      height: image.naturalHeight * coverScale * zoom,
    };
  }

  /**
   * Applies the photograph's zoom and position.
   * Prevents blank canvas edges from appearing.
   */
  function renderComposition(): void {
    const image = getImage();

    if (!image || !elements.preview.classList.contains("is-composition-active")) {
      return;
    }

    const dimensions = getImageDimensions(image);

    if (!dimensions) {
      return;
    }

    const canvasWidth = elements.preview.clientWidth;

    const canvasHeight = elements.preview.clientHeight;

    const maxOffsetX = Math.max(0, (dimensions.width - canvasWidth) / 2);

    const maxOffsetY = Math.max(0, (dimensions.height - canvasHeight) / 2);

    composition.offsetX = clamp(composition.offsetX, -maxOffsetX, maxOffsetX);

    composition.offsetY = clamp(composition.offsetY, -maxOffsetY, maxOffsetY);

    // Explicit pixel dimensions override the
    // original preview's CSS sizing.
    image.style.width = `${dimensions.width}px`;

    image.style.height = `${dimensions.height}px`;

    // Centre the image, then apply drag offsets.
    image.style.transform = `translate(
      calc(-50% + ${composition.offsetX}px),
      calc(-50% + ${composition.offsetY}px)
    )`;

    elements.zoomSlider.value = String(
      clamp(Number(composition.zoom) || MIN_ZOOM, MIN_ZOOM, MAX_ZOOM)
    );

    elements.zoomValue.textContent = `${Math.round(Number(elements.zoomSlider.value) * 100)}%`;
  }

  /**
   * Makes composition controls available when
   * both a photograph and canvas size exist.
   */
  function refreshComposition(): void {
    const image = getImage();

    // Multi-pet editing is handled by its own Konva canvas.
    if (atelierState.portrait.subjects.length > 1) {
      elements.controls.hidden = true;
      elements.preview.classList.remove("is-composition-active");
      activeImage = null;
      return;
    }

    const ready = Boolean(
      image &&
        atelierState.portrait.photo &&
        atelierState.canvas.sizeId !== null &&
        !elements.preview.classList.contains("is-unselected")
    );

    elements.controls.hidden = !ready;

    elements.preview.classList.toggle("is-composition-active", ready);

    if (!ready || !image) {
      activeImage = null;
      return;
    }

    if (image !== activeImage) {
      activeImage = image;

      if (!image.complete) {
        image.addEventListener("load", renderComposition, { once: true });
      }
    }

    renderComposition();
  }

  /**
   * Begin dragging the photograph.
   */
  elements.preview.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !elements.preview.classList.contains("is-composition-active")) {
      return;
    }

    dragging = true;

    dragStartX = event.clientX;
    dragStartY = event.clientY;

    initialOffsetX = composition.offsetX;

    initialOffsetY = composition.offsetY;

    elements.preview.setPointerCapture(event.pointerId);

    elements.preview.classList.add("is-dragging");
  });

  /**
   * Move the photograph while dragging.
   */
  elements.preview.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }

    composition.offsetX = initialOffsetX + event.clientX - dragStartX;

    composition.offsetY = initialOffsetY + event.clientY - dragStartY;

    renderComposition();
  });

  /**
   * Stop dragging.
   */
  function stopDragging(): void {
    dragging = false;

    elements.preview.classList.remove("is-dragging");
  }

  elements.preview.addEventListener("pointerup", stopDragging);

  elements.preview.addEventListener("pointercancel", stopDragging);

  elements.preview.addEventListener("lostpointercapture", stopDragging);

  /**
   * Change the photograph's zoom level.
   */
  elements.zoomSlider.addEventListener("input", () => {
    composition.zoom = clamp(Number(elements.zoomSlider.value), MIN_ZOOM, MAX_ZOOM);

    renderComposition();
  });

  /**
   * Restore the centred composition.
   */
  elements.resetButton.addEventListener("click", () => {
    composition.zoom = MIN_ZOOM;
    composition.offsetX = 0;
    composition.offsetY = 0;

    renderComposition();
  });

  /**
   * Reapply the composition when size,
   * shape or preview mode changes.
   */
  document.addEventListener("atelier:size-changed", refreshComposition);

  document.addEventListener("atelier:shape-changed", refreshComposition);

  document.addEventListener("atelier:canvas-screen-opened", refreshComposition);

  // IMPORTANT:
  // This event fires after canvasSizePreview.ts
  // replaces the photograph elements.
  document.addEventListener("atelier:preview-updated", refreshComposition);

  /**
   * Recalculate when the displayed canvas
   * changes size.
   */
  const resizeObserver = new ResizeObserver(() => {
    renderComposition();
  });

  resizeObserver.observe(elements.preview);

  refreshComposition();
  initMultiPetComposition();
}
