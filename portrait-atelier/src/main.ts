import "./style.css";
import "./styles/frameSelection.css";
import "./styles/roomVisualiser.css";
import "./styles/canvasDimensions.css";

import { atelierState } from "./app/atelierState";
import { loadPhoto } from "./app/photoStorage";

import { initPhotoUpload } from "./screens/photoUpload";
import { initCanvasSizeSelection } from "./screens/canvasSize";
import { updateCanvasPreviews } from "./screens/canvasShape";
import { initCanvasSizePreview } from "./screens/canvasSizePreview";
import { initCanvasComposition } from "./screens/canvasComposition";
import { initCanvasDimensions } from "./components/canvasDimensions";
import { initBackgroundSelection } from "./screens/backgroundSelection";
import { initFrameSelection } from "./screens/frameSelection";
import { initRoomVisualiser } from "./screens/roomVisualiser";
import { initPortraitSummary } from "./screens/portraitSummary";
import { initEnquiryForm } from "./screens/enquiryForm";
import "./styles/enquiryForm.css";
import "./styles/portraitSummary.css";

const TOTAL_STEPS = 7;
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
  const frameScreen = document.querySelector<HTMLElement>("#frame-screen");
  const roomScreen = document.querySelector<HTMLElement>("#room-screen");
  const summaryScreen = document.querySelector<HTMLElement>("#summary-screen");

  if (
    !welcomeScreen ||
    !photoScreen ||
    !canvasScreen ||
    !backgroundScreen ||
    !frameScreen ||
    !roomScreen ||
    !summaryScreen
  ) {
    throw new Error("Atelier screens not found");
  }

  // Show only the requested screen.
  welcomeScreen.hidden = step !== 1;
  photoScreen.hidden = step !== 2;
  canvasScreen.hidden = step !== 3;
  backgroundScreen.hidden = step !== 4;
  frameScreen.hidden = step !== 5;
  roomScreen.hidden = step !== 6;
  summaryScreen.hidden = step !== 7;

  // Update the active step.
  atelierState.currentStep = step;

  // Display additional artist guidance in guided mode.
  const photoGuidance = document.querySelector<HTMLElement>("#photo-guidance");

  if (photoGuidance) {
    photoGuidance.hidden = atelierState.mode !== "guided";
  }

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

  if (step === 5) {
    document.dispatchEvent(new Event("atelier:frame-screen-opened"));
  }

  if (step === 6) {
    document.dispatchEvent(new Event("atelier:room-screen-opened"));
  }

  if (step === 7) {
    document.dispatchEvent(new Event("atelier:summary-screen-opened"));
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
 * the Atelier screens.
 */
function initNavigation(): void {
  // Step 1 → Step 2
  // Both modes share the same screens and preserve customer selections.
  const choiceButtons = document.querySelectorAll<HTMLButtonElement>("[data-choice]");

  choiceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const choice = button.dataset.choice;

      if (choice !== "create" && choice !== "guided") {
        return;
      }

      atelierState.mode = choice;

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

  // Step 4 → Step 5
  document
    .querySelector<HTMLButtonElement>("#background-continue")
    ?.addEventListener("click", () => {
      goToStep(5);
    });

  // Step 5 → Step 4
  document.querySelector<HTMLButtonElement>("#frame-back")?.addEventListener("click", () => {
    goToStep(4);
  });

  document
    .querySelector<HTMLButtonElement>("#frame-continue")
    ?.addEventListener("click", () => goToStep(6));

  document
    .querySelector<HTMLButtonElement>("#room-back")
    ?.addEventListener("click", () => goToStep(5));

  document
    .querySelector<HTMLButtonElement>("#room-continue")
    ?.addEventListener("click", () => goToStep(7));

  document
    .querySelector<HTMLButtonElement>("#summary-back")
    ?.addEventListener("click", () => goToStep(6));
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

  // Step 2 restores multiple pets asynchronously from IndexedDB. Step 5 copies
  // Step 4's preview, so it must refresh AFTER restored pets/cutouts are ready.
  // Keep one refresh per animation frame even if several cutouts finish together.
  let pendingFrameRefresh = 0;

  function refreshFramingAfterPhotoRestore(): void {
    if (
      (atelierState.currentStep !== 5 && atelierState.currentStep !== 6) ||
      pendingFrameRefresh !== 0
    )
      return;

    pendingFrameRefresh = window.requestAnimationFrame(() => {
      pendingFrameRefresh = 0;

      if (atelierState.currentStep !== 5 && atelierState.currentStep !== 6) return;

      // Step 4 builds the current multi-pet composition synchronously when ready.
      document.dispatchEvent(new Event("atelier:background-screen-opened"));

      // Step 5 can now clone the up-to-date preview, not its pre-restore state.
      document.dispatchEvent(new Event("atelier:frame-screen-opened"));

      if (atelierState.currentStep === 6) {
        document.dispatchEvent(new Event("atelier:room-portrait-changed"));
      }
    });
  }

  document.addEventListener("atelier:subjects-changed", refreshFramingAfterPhotoRestore);
  document.addEventListener("atelier:cutout-ready", refreshFramingAfterPhotoRestore);

  // Step 2 — Photograph
  initPhotoUpload();

  // Step 3 — Canvas and composition
  initCanvasSizeSelection();
  initCanvasShapeSelection();
  initCanvasSizePreview();
  initCanvasComposition();

  // Step 4 — Background preferences
  initBackgroundSelection();

  // Step 5 — Frame preview
  initFrameSelection();

  // Step 6 — Room visualisation
  initRoomVisualiser();

  // Step 7 — Read-only portrait review
  initPortraitSummary();
  initEnquiryForm();

  initCanvasDimensions();

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
