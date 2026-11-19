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

  const sizeOptions = document.querySelector<HTMLElement>("#canvas-size-options");
  const sizeFeedback = document.querySelector<HTMLElement>("#canvas-size-feedback");
  const customSizeButton = document.querySelector<HTMLButtonElement>("#custom-size");
  const customWidth = document.querySelector<HTMLInputElement>("#custom-width");
  const customHeight = document.querySelector<HTMLInputElement>("#custom-height");

  // Small formats are for one pet only. For custom and square canvases,
  // require more painting area before offering a multi-pet composition.
  const MIN_MULTI_PET_AREA = 1600;
  const hasMultiplePets = (): boolean => atelierState.portrait.subjects.length > 1;
  const isEligible = (width: number, height: number): boolean =>
    !hasMultiplePets() || width * height >= MIN_MULTI_PET_AREA;

  function parseDimensions(value: string): { width: number; height: number } | null {
    const match = value.match(/(\d+)\s*[×x]\s*(\d+)/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  // Disable unsuitable visible options, while keeping their prices visible.
  function updateSizeEligibility(): void {
    if (!sizeOptions) return;
    const buttons = sizeOptions.querySelectorAll<HTMLButtonElement>("button");
    for (const button of buttons) {
      const dimensions = parseDimensions(button.textContent ?? "");
      if (!dimensions) continue;
      const restricted = !isEligible(dimensions.width, dimensions.height);
      button.disabled = restricted;
      button.classList.toggle("is-pet-restricted", restricted);
      button.title = restricted ? "This canvas size is suitable for one pet only." : "";
      button.setAttribute("aria-label", restricted
        ? `${dimensions.width} by ${dimensions.height} centimetres — one pet only`
        : `${dimensions.width} by ${dimensions.height} centimetres`);
    }
    const w = Number(customWidth?.value);
    const h = Number(customHeight?.value);
    const customRestricted = hasMultiplePets() &&
      Number.isFinite(w) && Number.isFinite(h) && w * h < MIN_MULTI_PET_AREA;
    customSizeButton?.classList.toggle("is-pet-restricted", customRestricted);

    if (sizeFeedback && hasMultiplePets()) {
      const oldText = sizeFeedback.textContent ?? "";
      if (!oldText || oldText.includes("one pet only") || oldText.includes("For several pets")) {
        sizeFeedback.textContent = "For several pets, the smallest canvas sizes are unavailable so there is room for detail.";
      }
    }
  }

  // Start with one photograph rather than two empty canvases.
  // Keep the comparison open even when a custom dimension needs correction.
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
      width < 25 ||
      height < 25 ||
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

    const alternatives = sizes.filter((size) => {
      const d = getDimensions(size);
      return size.id !== selected.id && isEligible(d.width, d.height);
    });

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
    const options = sizes.filter((size) => {
      const dimensions = getDimensions(size);
      return size.id !== selected?.id && isEligible(dimensions.width, dimensions.height);
    });

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

    if (hasMultiplePets()) {
      // The Konva editor overlays this placeholder and shows every pet,
      // even before a physical canvas size has been selected.
      const message = document.createElement("span");
      message.textContent = "Preparing your pets…";
      container.appendChild(message);
      label.textContent = "Arrange your pets · Choose a canvas size when ready";
    } else if (photo) {
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

    if (hasMultiplePets()) {
      // The composition module will draw every pet over this canvas.
      // Don't leave the first pet's original photograph underneath it.
      const placeholder = document.createElement("span");
      placeholder.textContent = "Preparing your pets…";
      container.appendChild(placeholder);
    } else if (photo) {
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
   * Comparison canvases share one pixels-per-centimetre scale.
   * Using a single scale is important: independently fitting each canvas
   * to its slot would hide the physical size difference.
   */
  function setComparisonScale(
    selected: CanvasSize | null,
    comparison: CanvasSize | null,
    enabled: boolean,
  ): void {
    const previews = [elements.secondPreview, elements.firstPreview];

    for (const preview of previews) {
      preview.classList.toggle("is-proportional-comparison", enabled);
      preview.style.removeProperty("--comparison-pixel-width");
      preview.style.removeProperty("--comparison-pixel-height");
    }

    if (!enabled || !selected || !comparison) {
      return;
    }

    const a = getDimensions(selected);
    const b = getDimensions(comparison);

    // The two previews each occupy roughly half of the available row.
    // Reserve space for the gap and padding, and cap the preview height.
    const availableWidth = Math.max(220, elements.previewArea.clientWidth - 40);
    const slotWidth = availableWidth / 2;
    const maxHeight = window.innerWidth <= 700 ? 235 : 340;
    const maxWidthCm = Math.max(a.width, b.width);
    const maxHeightCm = Math.max(a.height, b.height);
    const pixelsPerCm = Math.min(
      slotWidth / maxWidthCm,
      maxHeight / maxHeightCm,
    );

    for (const [preview, dimensions] of [
      [elements.secondPreview, a],
      [elements.firstPreview, b],
    ] as const) {
      preview.style.setProperty(
        "--comparison-pixel-width",
        `${Math.max(1, dimensions.width * pixelsPerCm)}px`,
      );
      preview.style.setProperty(
        "--comparison-pixel-height",
        `${Math.max(1, dimensions.height * pixelsPerCm)}px`,
      );
    }
  }

  /** Explain why very large custom canvases appear smaller on screen. */
  const scaleNote = document.createElement("p");
  scaleNote.className = "canvas-comparison-scale-note";
  scaleNote.textContent =
    "Both canvases are scaled to fit. Their relative physical sizes are preserved.";
  scaleNote.hidden = true;
  elements.previewArea.insertAdjacentElement("afterend", scaleNote);

  /**
   * Updates the selected canvas and comparison preview.
   */
  function updatePreviews(): void {
    const sizes = getAvailableSizes();

    if (atelierState.canvas.shape !== previousShape) {
      comparisonId = null;

      previousShape = atelierState.canvas.shape;
    }

    updateSizeEligibility();
    let selected = getSelectedSize(sizes);
    let selectedSizeIsRestricted = false;
    if (atelierState.canvas.sizeId === "custom" && selected === null && sizeFeedback) {
      sizeFeedback.textContent = "Custom canvas dimensions must be at least 25 cm on each side.";
    }

    if (selected) {
      const dimensions = getDimensions(selected);
      if (!isEligible(dimensions.width, dimensions.height)) {
        // Keep state and the underlying size module in sync by using the
        // existing size button rather than assigning canvas fields directly.
        const next = sizeOptions?.querySelector<HTMLButtonElement>("button:not(:disabled)");
        if (next && selected.id !== "custom") {
          queueMicrotask(() => next.click());
          return;
        }
        // Keep the custom canvas visible in comparison mode so the layout
        // does not jump back to a single canvas. It remains unavailable
        // for continuing until the customer increases its dimensions.
        selectedSizeIsRestricted = true;
        if (sizeFeedback) {
          sizeFeedback.textContent =
            "This custom size is too small for several pets. Please increase the dimensions.";
        }
      }
    }

    const comparison = updateComparisonOptions(selected, sizes);

    const photo = getPhotoUrl();

    // LEFT: Customer's selected canvas.
    renderCanvas(elements.secondPreview, elements.secondLabel, selected, photo);

    // RIGHT: Comparison canvas.
    renderCanvas(elements.firstPreview, elements.firstLabel, comparison, photo);

    const multiPet = atelierState.portrait.subjects.length > 1;
    // An invalid custom size should not collapse the comparison view.
    const showComparison = compareMode;

    elements.comparisonFigure.hidden = !showComparison;

    elements.comparisonSelector.hidden = !showComparison;

    elements.previewArea.classList.toggle("is-single-view", !showComparison);
    setComparisonScale(selected, comparison, showComparison);
    scaleNote.hidden = !showComparison;

    elements.compareButton.hidden = false;
    elements.singleButton.hidden = false;
    elements.previewArea.classList.toggle("has-multi-pets", multiPet);
    elements.compareButton.disabled = false;
    const continueButton = document.querySelector<HTMLButtonElement>("#canvas-continue");
    if (continueButton && hasMultiplePets()) {
      continueButton.disabled = selected === null || selectedSizeIsRestricted;
    }

    elements.compareButton.setAttribute("aria-pressed", String(showComparison));

    elements.singleButton.setAttribute("aria-pressed", String(!showComparison));

    if (multiPet && selected) {
      const dimensions = getDimensions(selected);
      elements.secondLabel.textContent = `${dimensions.width} × ${dimensions.height} cm · Arrange your pets`;
    }

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

  // Shape controls may rebuild size buttons and reset selected dimensions.
  // Refresh after the current shape-change handlers have completed so that
  // the sizes, photos, live arrangement and comparison use the new shape.
  document.addEventListener("atelier:shape-changed", () => {
    // The shape/size modules update their buttons during this same event.
    // Choose a valid size automatically rather than requiring a second click.
    const previousArea = (atelierState.canvas.width ?? 0) *
      (atelierState.canvas.height ?? 0);
    requestAnimationFrame(() => {
      updateSizeEligibility();
      const candidates = Array.from(
        sizeOptions?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
      ).filter((button) => parseDimensions(button.textContent ?? "") !== null);
      const closest = candidates.sort((left, right) => {
        const a = parseDimensions(left.textContent ?? "")!;
        const b = parseDimensions(right.textContent ?? "")!;
        return Math.abs(a.width * a.height - previousArea) -
          Math.abs(b.width * b.height - previousArea);
      })[0];
      if (closest) {
        closest.click(); // Triggers the existing canvas-size module and UI updates.
      } else {
        updatePreviews();
      }
    });
  });

  document.addEventListener("atelier:canvas-screen-opened", updatePreviews);

  document.addEventListener("atelier:subjects-changed", updatePreviews);
  // The canvas-size module may rebuild its buttons after a shape change.
  // Watch only child changes to avoid an attribute update loop.
  if (sizeOptions) {
    new MutationObserver(updateSizeEligibility).observe(sizeOptions, { childList: true, subtree: true });
  }
  if (customWidth) customWidth.min = "25";
  if (customHeight) customHeight.min = "25";
  customWidth?.addEventListener("change", updatePreviews);
  customHeight?.addEventListener("change", updatePreviews);
  // Also refresh while users type (or adjust a custom size interactively).
  customWidth?.addEventListener("input", () => requestAnimationFrame(updatePreviews));
  customHeight?.addEventListener("input", () => requestAnimationFrame(updatePreviews));
  window.addEventListener("resize", updatePreviews);
  document.querySelector("#custom-size-fields")?.addEventListener("click", () => {
    queueMicrotask(updatePreviews);
  });

  updatePreviews();
}
