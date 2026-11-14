import "./style.css";

import { atelierState } from "./app/atelierState";
import { loadPhoto } from "./app/photoStorage";

import { initPhotoUpload } from "./screens/photoUpload";
import { initCanvasSizeSelection } from "./screens/canvasSize";
import { updateCanvasPreviews } from "./screens/canvasShape";
import { initCanvasSizePreview } from "./screens/canvasSizePreview";
import { initCanvasComposition } from "./screens/canvasComposition";
import { initBackgroundSelection } from "./screens/backgroundSelection";

const TOTAL_STEPS = 4;
const STORAGE_KEY = "atelier-current-step";

/**
 * Checks whether a step exists in the current Atelier.
 */
function isValidStep(step: number): boolean {
  return Number.isInteger(step) && step >= 1 && step <= TOTAL_STEPS;
}

/**
 * Updates the Atelier progress indicator.
 */
function updateProgress(step: number): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".atelier-progress-step");

  const status = document.querySelector<HTMLElement>("#atelier-progress-status");

  const fill = document.querySelector<HTMLElement>("#atelier-progress-fill");

  if (!status || !fill || buttons.length !== TOTAL_STEPS) {
    throw new Error("Atelier progress elements not found");
  }

  buttons.forEach((button) => {
    const buttonStep = Number(button.dataset.step);
    const isCurrent = buttonStep === step;
    const isCompleted = buttonStep < step;

    button.classList.toggle("is-current", isCurrent);
    button.classList.toggle("is-completed", isCompleted);

    if (isCurrent) {
      button.setAttribute("aria-current", "step");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  status.textContent = `Step ${step} of ${TOTAL_STEPS}`;

  fill.style.width = `${(step / TOTAL_STEPS) * 100}%`;
}

/**
 * Displays the requested Atelier screen.
 * All other screens remain in the DOM but are hidden.
 */
function goToStep(step: number): void {
  if (!isValidStep(step)) {
    return;
  }

  const welcomeScreen = document.querySelector<HTMLElement>(".atelier-welcome");

  const photoScreen = document.querySelector<HTMLElement>("#photo-screen");

  const canvasScreen = document.querySelector<HTMLElement>("#canvas-screen");

  const backgroundScreen = document.querySelector<HTMLElement>("#background-screen");

  if (!welcomeScreen || !photoScreen || !canvasScreen || !backgroundScreen) {
    throw new Error("Atelier screens not found");
  }

  // Show only the requested screen.
  welcomeScreen.hidden = step !== 1;
  photoScreen.hidden = step !== 2;
  canvasScreen.hidden = step !== 3;
  backgroundScreen.hidden = step !== 4;

  // Update the active step.
  atelierState.currentStep = step;

  // Update progress indicator.
  updateProgress(step);

  // Remember the current step during this browser session.
  sessionStorage.setItem(STORAGE_KEY, String(step));

  // Refresh the photograph upload screen.
  if (step === 2) {
    document.dispatchEvent(new Event("atelier:photo-screen-opened"));
  }

  // Refresh canvas previews when returning to Step 3.
  if (step === 3) {
    updateCanvasPreviews();

    document.dispatchEvent(new Event("atelier:canvas-screen-opened"));
  }

  if (step === 4) {
    document.dispatchEvent(new Event("atelier:background-screen-opened"));
  }

  // Make the current screen visible from the top.
  window.scrollTo({
    top: 0,
    behavior: "auto",
  });
}

/**
 * Allows customers to navigate directly to
 * any available Atelier stage.
 */
function initProgressNavigation(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".atelier-progress-step");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.dataset.step);

      if (!isValidStep(step)) {
        return;
      }

      goToStep(step);
    });
  });
}

/**
 * Handles canvas shape selection.
 * Preserves the selected canvas size unless
 * the customer chooses a different shape.
 */
function initCanvasShapeSelection(): void {
  const shapeButtons = document.querySelectorAll<HTMLButtonElement>(".shape-option");

  type CanvasShape = "portrait" | "landscape" | "square";

  function selectShape(shape: CanvasShape): void {
    const shapeChanged = atelierState.canvas.shape !== shape;

    shapeButtons.forEach((button) => {
      const selected = button.dataset.shape === shape;

      button.classList.toggle("is-selected", selected);

      button.setAttribute("aria-pressed", String(selected));
    });

    atelierState.canvas.shape = shape;

    // Reset dimensions only when changing shape.
    if (shapeChanged) {
      atelierState.canvas.width = null;
      atelierState.canvas.height = null;
      atelierState.canvas.sizeId = null;
    }

    // Inform size and preview modules.
    document.dispatchEvent(new Event("atelier:shape-changed"));
  }

  shapeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const shape = button.dataset.shape;

      if (shape !== "portrait" && shape !== "landscape" && shape !== "square") {
        return;
      }

      selectShape(shape);
    });
  });

  // Synchronise the initial shape selection.
  selectShape(atelierState.canvas.shape);
}

/**
 * Connects the navigation buttons between
 * the four Atelier screens.
 */
function initNavigation(): void {
  // Step 1 → Step 2
  const choiceButtons = document.querySelectorAll<HTMLButtonElement>("[data-choice]");

  choiceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      goToStep(2);
    });
  });

  // Step 2 → Step 1
  document.querySelector<HTMLButtonElement>("#photo-back")?.addEventListener("click", () => {
    goToStep(1);
  });

  // Step 2 → Step 3
  document.querySelector<HTMLButtonElement>("#photo-continue")?.addEventListener("click", () => {
    goToStep(3);
  });

  // Step 3 → Step 2
  document.querySelector<HTMLButtonElement>("#canvas-back")?.addEventListener("click", () => {
    goToStep(2);
  });

  // Step 3 → Step 4
  document.querySelector<HTMLButtonElement>("#canvas-continue")?.addEventListener("click", () => {
    goToStep(4);
  });

  // Step 4 → Step 3
  document.querySelector<HTMLButtonElement>("#background-back")?.addEventListener("click", () => {
    goToStep(3);
  });

  // #background-continue will be connected
  // when we create Step 5.
}

/**
 * Initialises the Atelier and restores the
 * previously uploaded photograph before
 * showing the customer's saved screen.
 */
async function startAtelier(): Promise<void> {
  // Navigation
  initProgressNavigation();
  initNavigation();

  // Step 2 — Photograph
  initPhotoUpload();

  // Step 3 — Canvas and composition
  initCanvasSizeSelection();
  initCanvasShapeSelection();
  initCanvasSizePreview();
  initCanvasComposition();

  // Step 4 — Background preferences
  initBackgroundSelection();

  // Restore the uploaded photograph from IndexedDB.
  try {
    atelierState.portrait.photo = await loadPhoto();
  } catch {
    const feedback = document.querySelector<HTMLElement>("#upload-feedback");

    if (feedback) {
      feedback.textContent =
        "We couldn't restore your previous photograph. Please choose it again.";
    }
  }

  // Restore the last visited step.
  const savedStep = Number(sessionStorage.getItem(STORAGE_KEY));

  const initialStep = isValidStep(savedStep) ? savedStep : 1;

  goToStep(initialStep);
}

void startAtelier();
