import { atelierState } from "../app/atelierState";
import { createGuidedAdvice } from "../components/guidedAdvice";

import {
  canvasSizes,
  squareCanvasSizes,
  getOrientedDimensions,
  type CanvasSize,
} from "../app/canvasSizes";

import { calculateCustomPrice } from "../app/canvasPricing";
import { loadCanvasSelection, saveCanvasSelection } from "../app/atelierChoiceStorage";

const MIN_DIMENSION = 25;
const MAX_DIMENSION = 200;
const DIMENSION_STEP = 5;

const DEFAULT_CUSTOM_WIDTH = 50;
const DEFAULT_CUSTOM_HEIGHT = 40;

/**
 * Initialises standard and custom canvas-size selection.
 *
 * Custom dimensions are adjusted in 5 cm increments.
 * Prices and previews update automatically.
 */
export function initCanvasSizeSelection(): void {
  const container = document.querySelector<HTMLElement>("#canvas-size-options");

  const customButton = document.querySelector<HTMLButtonElement>("#custom-size");

  const customFields = document.querySelector<HTMLElement>("#custom-size-fields");

  const widthInput = document.querySelector<HTMLInputElement>("#custom-width");

  const heightInput = document.querySelector<HTMLInputElement>("#custom-height");

  const feedback = document.querySelector<HTMLElement>("#canvas-size-feedback");

  if (!container || !customButton || !customFields || !widthInput || !heightInput || !feedback) {
    throw new Error("Canvas size selection elements not found");
  }

  const elements = {
    container,
    customButton,
    customFields,
    widthInput,
    heightInput,
    feedback,
  };

  const guidance = createGuidedAdvice({
    id: "canvas-guidance",
  });

  guidance.element.classList.add("canvas-guided-advice");
  elements.container.insertAdjacentElement("beforebegin", guidance.element);

  /** Adjust the advice to the number of pets without changing any selection. */
  function updateGuidedAdvice(): void {
    guidance.syncVisibility();
    if (guidance.element.hidden) return;

    const petCount =
      atelierState.portrait.subjects.length || atelierState.portrait.numberOfPets || 0;

    if (petCount >= 3) {
      guidance.update(
        "With several pets, a larger canvas gives me more room to capture their individual expressions. " +
          "Try comparing sizes around 60 × 50 cm or larger. I'll help confirm the best dimensions."
      );
    } else if (petCount === 2) {
      guidance.update(
        "For two pets, it's worth allowing extra space for both faces and their details. " +
          "Try comparing sizes around 50 × 40 cm or larger. I'll help you find the right balance."
      );
    } else if (petCount === 1) {
      guidance.update(
        "For one pet, a smaller canvas can work beautifully for a close-up portrait. " +
          "If you'd like more of the body or surroundings, compare a larger size too."
      );
    } else {
      guidance.update(
        "Not sure where to start? Smaller sizes suit simple, close-up portraits, " +
          "while more pets or detailed scenes usually need more space. " +
          "You can explore sizes now and I'll advise you personally before painting."
      );
    }
  }

  document.addEventListener("atelier:canvas-screen-opened", updateGuidedAdvice);
  document.addEventListener("atelier:subjects-changed", updateGuidedAdvice);

  // Preserve custom values when switching between standard sizes.
  let customWidth = DEFAULT_CUSTOM_WIDTH;
  let customHeight = DEFAULT_CUSTOM_HEIGHT;

  // Restore on refresh before rendering size buttons and previews.
  const saved = loadCanvasSelection();
  if (saved) {
    atelierState.canvas.shape = saved.shape;
    atelierState.canvas.sizeId = saved.sizeId;
    atelierState.canvas.width = saved.width;
    atelierState.canvas.height = saved.height;
    customWidth = saved.customWidth;
    customHeight = saved.customHeight;
  }

  function persistCanvas(): void {
    saveCanvasSelection({
      ...atelierState.canvas,
      customWidth,
      customHeight,
    });
  }

  function updateShapeCards(): void {
    document.querySelectorAll<HTMLButtonElement>(".shape-option[data-shape]").forEach((button) => {
      const selected = button.dataset.shape === atelierState.canvas.shape;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  // Dimensions are controlled through the stepper buttons.
  elements.widthInput.readOnly = true;
  elements.widthInput.min = String(MIN_DIMENSION);
  elements.heightInput.readOnly = true;
  elements.heightInput.min = String(MIN_DIMENSION);

  elements.widthInput.value = String(customWidth);
  elements.heightInput.value = String(customHeight);

  /**
   * Notifies the preview that the canvas dimensions changed.
   */
  function notifySizeChanged(): void {
    persistCanvas();
    document.dispatchEvent(new Event("atelier:size-changed"));
  }

  /**
   * Formats a price in euros.
   */
  function formatPrice(price: number): string {
    return price.toLocaleString("en-IE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });
  }

  /**
   * Updates the selected state of the size options.
   */
  function updateSelection(): void {
    const buttons = elements.container.querySelectorAll<HTMLButtonElement>("[data-size-id]");

    buttons.forEach((button) => {
      const selected = button.dataset.sizeId === atelierState.canvas.sizeId;

      button.classList.toggle("is-selected", selected);

      button.setAttribute("aria-pressed", String(selected));
    });

    const isCustom = atelierState.canvas.sizeId === "custom";

    elements.customButton.classList.toggle("is-selected", isCustom);

    elements.customButton.setAttribute("aria-pressed", String(isCustom));

    elements.customFields.hidden = !isCustom;
  }

  /**
   * Validates custom dimensions and updates the estimated price.
   */
  function updateCustomDimensions(): void {
    customWidth = Number(elements.widthInput.value);
    customHeight = Number(elements.heightInput.value);

    const validIncrements =
      customWidth % DIMENSION_STEP === 0 && customHeight % DIMENSION_STEP === 0;
    const validRange =
      customWidth >= MIN_DIMENSION &&
      customHeight >= MIN_DIMENSION &&
      customWidth <= MAX_DIMENSION &&
      customHeight <= MAX_DIMENSION;

    const price = calculateCustomPrice(customWidth, customHeight);

    if (!validIncrements || !validRange || price === null) {
      atelierState.canvas.width = null;
      atelierState.canvas.height = null;

      elements.feedback.textContent =
        "Please choose dimensions between 25 and 200 cm in 5 cm increments.";

      notifySizeChanged();
      return;
    }

    atelierState.canvas.width = customWidth;
    atelierState.canvas.height = customHeight;

    elements.feedback.textContent =
      `Estimated price: ${formatPrice(price)}. ` + "Final price confirmed personally.";

    notifySizeChanged();
  }

  /**
   * Selects a standard canvas size or the custom option.
   */
  function selectSize(size: CanvasSize | "custom"): void {
    if (size === "custom") {
      atelierState.canvas.sizeId = "custom";

      elements.widthInput.value = String(customWidth);
      elements.heightInput.value = String(customHeight);

      updateCustomDimensions();
    } else {
      const dimensions = getOrientedDimensions(size, atelierState.canvas.shape);

      atelierState.canvas.sizeId = size.id;
      atelierState.canvas.width = dimensions.width;
      atelierState.canvas.height = dimensions.height;

      elements.feedback.textContent = `Selected: ${dimensions.width} × ${dimensions.height} cm`;

      notifySizeChanged();
    }

    updateSelection();
  }

  /**
   * Creates a compact canvas size button with
   * the dimensions and price on one line.
   */
  function createSizeButton(size: CanvasSize): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "selection-card canvas-size-option";
    button.dataset.sizeId = size.id;
    button.setAttribute("aria-pressed", "false");

    const dimensions = getOrientedDimensions(size, atelierState.canvas.shape);

    const sizeLabel = document.createElement("strong");
    sizeLabel.className = "canvas-size-dimensions";

    sizeLabel.textContent = `${dimensions.width} × ${dimensions.height} cm`;

    const priceLabel = document.createElement("span");
    priceLabel.className = "canvas-size-price";

    priceLabel.textContent = size.estimated
      ? `Est. ${formatPrice(size.price)}`
      : formatPrice(size.price);

    button.append(sizeLabel, priceLabel);

    button.addEventListener("click", () => {
      selectSize(size);
    });

    return button;
  }

  /**
   * Creates the available size list for the chosen shape.
   */
  function renderSizes(): void {
    elements.container.replaceChildren();

    const sizes = atelierState.canvas.shape === "square" ? squareCanvasSizes : canvasSizes;

    sizes.forEach((size) => {
      elements.container.appendChild(createSizeButton(size));
    });

    updateSelection();
    updateShapeCards();
  }

  /**
   * Changes a custom dimension by exactly 5 cm,
   * while respecting the minimum and maximum values.
   */
  function adjustDimension(dimension: "width" | "height", change: number): void {
    const input = dimension === "width" ? elements.widthInput : elements.heightInput;

    const currentValue = Number(input.value);

    const requested = currentValue + change;
    const nextValue = Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, requested));

    input.value = String(nextValue);
    updateCustomDimensions();
    updateDimensionButtons();

    if (requested < MIN_DIMENSION && change < 0) {
      elements.feedback.textContent = "Minimum canvas size is 25 cm.";
    }
  }

  /**
   * Disables minus/plus buttons at the allowed limits.
   */
  function updateDimensionButtons(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>(".dimension-button");

    buttons.forEach((button) => {
      const dimension = button.dataset.dimension;
      const action = button.dataset.action;

      const input =
        dimension === "width"
          ? elements.widthInput
          : dimension === "height"
            ? elements.heightInput
            : null;

      if (!input) return;

      const value = Number(input.value);

      // Keep the minimum button clickable to explain why it cannot go lower.
      // The value itself is always clamped in adjustDimension().
      const atMinimum = action === "decrease" && value <= MIN_DIMENSION;
      button.disabled = action === "increase" && value >= MAX_DIMENSION;
      button.classList.toggle("is-at-limit", atMinimum);
      button.setAttribute("aria-disabled", String(atMinimum || button.disabled));
      if (atMinimum) {
        button.title = "Minimum canvas size is 25 cm";
      } else {
        button.removeAttribute("title");
      }
    });
  }

  /**
   * Connects the custom dimension stepper buttons.
   */
  function initDimensionControls(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>(".dimension-button");

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        if (atelierState.canvas.sizeId !== "custom") {
          return;
        }

        const dimension = button.dataset.dimension;
        const action = button.dataset.action;

        if (dimension !== "width" && dimension !== "height") {
          return;
        }

        if (action !== "increase" && action !== "decrease") {
          return;
        }

        adjustDimension(dimension, action === "increase" ? DIMENSION_STEP : -DIMENSION_STEP);
      });
    });

    updateDimensionButtons();
  }

  // Select bespoke measurements.
  elements.customButton.addEventListener("click", () => {
    selectSize("custom");
    updateDimensionButtons();
  });

  // Update the size catalogue when the shape changes.
  document.addEventListener("atelier:shape-changed", () => {
    renderSizes();
    updateShapeCards();
    persistCanvas();
  });

  // If another canvas module changes the selected size, persist that too.
  document.addEventListener("atelier:size-changed", persistCanvas);

  // Initialise the controls.
  initDimensionControls();
  renderSizes();
  updateShapeCards();
  if (saved) {
    elements.widthInput.value = String(customWidth);
    elements.heightInput.value = String(customHeight);
    updateDimensionButtons();
    if (saved.sizeId === "custom") {
      updateCustomDimensions();
    }
  }
}
