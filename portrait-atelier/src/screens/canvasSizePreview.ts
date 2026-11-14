import { atelierState } from "../app/atelierState";

import {
  canvasSizes,
  squareCanvasSizes,
  getOrientedDimensions,
  type CanvasSize,
} from "../app/canvasSizes";

/**
 * Displays the customer's photograph, selected canvas,
 * and optional size comparison.
 */
export function initCanvasSizePreview(): void {
  const firstPreview = document.querySelector<HTMLElement>("#size-preview-first");

  const secondPreview = document.querySelector<HTMLElement>("#size-preview-second");

  const firstLabel = document.querySelector<HTMLElement>("#size-preview-first-label");

  const secondLabel = document.querySelector<HTMLElement>("#size-preview-second-label");

  const compareButton = document.querySelector<HTMLButtonElement>("#compare-sizes");

  const singleButton = document.querySelector<HTMLButtonElement>("#view-single-size");

  const comparisonSelect = document.querySelector<HTMLSelectElement>("#comparison-size");

  const comparisonSelector = document.querySelector<HTMLElement>("#comparison-size-selector");

  const previewArea = document.querySelector<HTMLElement>(".size-preview-canvases");

  if (
    !firstPreview ||
    !secondPreview ||
    !firstLabel ||
    !secondLabel ||
    !compareButton ||
    !singleButton ||
    !comparisonSelect ||
    !comparisonSelector ||
    !previewArea
  ) {
    throw new Error("Canvas preview elements not found");
  }

  const comparisonFigure = firstPreview.closest("figure");

  if (!comparisonFigure) {
    throw new Error("Comparison figure not found");
  }

  const elements = {
    firstPreview,
    secondPreview,
    firstLabel,
    secondLabel,
    compareButton,
    singleButton,
    comparisonSelect,
    comparisonSelector,
    comparisonFigure,
    previewArea,
  };

  // Start with one photograph rather than two empty canvases.
  let compareMode = false;

  let comparisonId: string | null = null;

  let previousShape = atelierState.canvas.shape;

  let photoUrl: string | null = null;

  let previousPhoto: File | null = null;

  /**
   * Returns standard sizes for the selected canvas shape.
   */
  function getAvailableSizes(): CanvasSize[] {
    return atelierState.canvas.shape === "square" ? squareCanvasSizes : canvasSizes;
  }

  /**
   * Returns the actual width and height of a canvas.
   */
  function getDimensions(size: CanvasSize): { width: number; height: number } {
    if (size.id === "custom") {
      return {
        width: size.width,
        height: size.height,
      };
    }

    return getOrientedDimensions(size, atelierState.canvas.shape);
  }

  /**
   * Returns a custom canvas when dimensions are valid.
   */
  function getCustomSize(): CanvasSize | null {
    const { width, height } = atelierState.canvas;

    if (
      width === null ||
      height === null ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 10 ||
      height < 10 ||
      width > 200 ||
      height > 200 ||
      width % 5 !== 0 ||
      height % 5 !== 0
    ) {
      return null;
    }

    return {
      id: "custom",
      width,
      height,
      price: 0,
      description: "Bespoke canvas dimensions",
    };
  }

  /**
   * Creates a photograph URL only when the file changes.
   */
  function getPhotoUrl(): string | null {
    const photo = atelierState.portrait.photo;

    if (photo === previousPhoto) {
      return photoUrl;
    }

    if (photoUrl) {
      URL.revokeObjectURL(photoUrl);
    }

    previousPhoto = photo;

    photoUrl = photo ? URL.createObjectURL(photo) : null;

    return photoUrl;
  }

  /**
   * Gets the canvas size selected by the customer.
   */
  function getSelectedSize(sizes: CanvasSize[]): CanvasSize | null {
    const selectedId = atelierState.canvas.sizeId;

    if (selectedId === "custom") {
      return getCustomSize();
    }

    return sizes.find((size) => size.id === selectedId) ?? null;
  }

  /**
   * Finds the nearest standard size for comparison.
   */
  function getSuggestedComparison(selected: CanvasSize, sizes: CanvasSize[]): CanvasSize | null {
    const selectedArea = selected.width * selected.height;

    const alternatives = sizes.filter((size) => size.id !== selected.id);

    if (alternatives.length === 0) {
      return null;
    }

    return alternatives.reduce((closest, size) => {
      const difference = Math.abs(size.width * size.height - selectedArea);

      const closestDifference = Math.abs(closest.width * closest.height - selectedArea);

      return difference < closestDifference ? size : closest;
    });
  }

  /**
   * Updates the comparison dropdown.
   */
  function updateComparisonOptions(
    selected: CanvasSize | null,
    sizes: CanvasSize[]
  ): CanvasSize | null {
    const options = sizes.filter((size) => size.id !== selected?.id);

    const savedComparison = options.find((size) => size.id === comparisonId);

    const comparison =
      savedComparison ?? (selected ? getSuggestedComparison(selected, sizes) : null);

    comparisonId = comparison?.id ?? null;

    elements.comparisonSelect.replaceChildren();

    options.forEach((size) => {
      const dimensions = getDimensions(size);

      const option = document.createElement("option");

      option.value = size.id;

      option.textContent = `${dimensions.width} × ${dimensions.height} cm`;

      elements.comparisonSelect.appendChild(option);
    });

    if (comparisonId) {
      elements.comparisonSelect.value = comparisonId;
    }

    elements.comparisonSelect.disabled = options.length === 0 || !selected;

    return comparison;
  }

  /**
   * Shows the uploaded photograph before specific
   * canvas dimensions have been selected.
   */
  function renderUnselectedPhoto(
    container: HTMLElement,
    label: HTMLElement,
    photo: string | null
  ): void {
    container.replaceChildren();

    container.classList.add("is-unselected");

    container.dataset.shape = atelierState.canvas.shape;

    container.style.removeProperty("--canvas-width");
    container.style.removeProperty("--canvas-height");

    if (photo) {
      const image = document.createElement("img");

      image.src = photo;
      image.alt = "";
      image.className = "size-preview-image";

      container.appendChild(image);

      label.textContent = "Choose a size to explore your portrait";
    } else {
      const message = document.createElement("span");

      message.textContent = "Choose a photograph to begin";

      container.appendChild(message);

      label.textContent = "No photograph selected";
    }
  }

  /**
   * Displays the photograph inside a selected canvas.
   */
  function renderCanvas(
    container: HTMLElement,
    label: HTMLElement,
    size: CanvasSize | null,
    photo: string | null
  ): void {
    if (!size) {
      renderUnselectedPhoto(container, label, photo);

      return;
    }

    container.replaceChildren();

    container.classList.remove("is-unselected");

    container.removeAttribute("data-shape");

    const dimensions = getDimensions(size);

    container.style.setProperty("--canvas-width", String(dimensions.width));

    container.style.setProperty("--canvas-height", String(dimensions.height));

    label.textContent = `${dimensions.width} × ${dimensions.height} cm`;

    if (photo) {
      const image = document.createElement("img");

      image.src = photo;
      image.alt = "";
      image.className = "size-preview-image";

      container.appendChild(image);
    } else {
      const placeholder = document.createElement("span");

      placeholder.textContent = "Photograph preview";

      container.appendChild(placeholder);
    }
  }

  /**
   * Updates the selected canvas and comparison preview.
   */
  function updatePreviews(): void {
    const sizes = getAvailableSizes();

    if (atelierState.canvas.shape !== previousShape) {
      comparisonId = null;

      previousShape = atelierState.canvas.shape;
    }

    const selected = getSelectedSize(sizes);

    const comparison = updateComparisonOptions(selected, sizes);

    const photo = getPhotoUrl();

    // LEFT: Customer's selected canvas.
    renderCanvas(elements.secondPreview, elements.secondLabel, selected, photo);

    // RIGHT: Comparison canvas.
    renderCanvas(elements.firstPreview, elements.firstLabel, comparison, photo);

    const showComparison = compareMode && selected !== null;

    elements.comparisonFigure.hidden = !showComparison;

    elements.comparisonSelector.hidden = !showComparison;

    elements.previewArea.classList.toggle("is-single-view", !showComparison);

    elements.compareButton.disabled = selected === null;

    elements.compareButton.setAttribute("aria-pressed", String(showComparison));

    elements.singleButton.setAttribute("aria-pressed", String(!showComparison));

    // IMPORTANT:
    // Let the composition module know that the
    // preview images have been rebuilt.
    document.dispatchEvent(new CustomEvent("atelier:preview-updated"));
  }

  /**
   * Switch to the single-canvas preview.
   */
  elements.singleButton.addEventListener("click", () => {
    compareMode = false;
    updatePreviews();
  });

  /**
   * Switch to side-by-side comparison.
   */
  elements.compareButton.addEventListener("click", () => {
    compareMode = true;
    updatePreviews();
  });

  /**
   * Change the comparison canvas dimensions.
   */
  elements.comparisonSelect.addEventListener("change", () => {
    comparisonId = elements.comparisonSelect.value;

    updatePreviews();
  });

  document.addEventListener("atelier:size-changed", updatePreviews);

  document.addEventListener("atelier:shape-changed", updatePreviews);

  document.addEventListener("atelier:canvas-screen-opened", updatePreviews);

  updatePreviews();
}
