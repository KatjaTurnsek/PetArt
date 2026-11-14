import { loadPhoto } from "./app/photoStorage";
import { initCanvasSizePreview } from "./screens/canvasSizePreview";
import { initCanvasSizeSelection } from "./screens/canvasSize";
import { updateCanvasPreviews } from "./screens/canvasShape";
import { initCanvasComposition } from "./screens/canvasComposition";

import "./style.css";

import { atelierState } from "./app/atelierState";
import { initPhotoUpload } from "./screens/photoUpload";

/**
 * Updates the Atelier progress indicator.
 */
function updateProgress(step: number): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".atelier-progress-step");

  const status = document.querySelector<HTMLElement>("#atelier-progress-status");

  const fill = document.querySelector<HTMLElement>("#atelier-progress-fill");

  const totalSteps = buttons.length;

  if (!status || !fill || totalSteps === 0) {
    throw new Error("Atelier progress elements not found");
  }

  buttons.forEach((button) => {
    const buttonStep = Number(button.dataset.step);
    const isCurrent = buttonStep === step;

    button.classList.toggle("is-current", isCurrent);
    button.classList.toggle("is-completed", buttonStep < step);

    if (isCurrent) {
      button.setAttribute("aria-current", "step");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  status.textContent = `Step ${step} of ${totalSteps}`;

  fill.style.width = `${(step / totalSteps) * 100}%`;
}

/**
 * Allows customers to navigate directly to
 * an existing Atelier stage.
 */
function initProgressNavigation(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".atelier-progress-step");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.dataset.step);

      if (![1, 2, 3].includes(step)) {
        return;
      }

      goToStep(step);
    });
  });
}

/**
 * Displays the requested Atelier screen.
 * All other screens remain in the DOM but are hidden.
 */
function goToStep(step: number): void {
  const welcomeScreen = document.querySelector<HTMLElement>(".atelier-welcome");
  const photoScreen = document.querySelector<HTMLElement>("#photo-screen");
  const canvasScreen = document.querySelector<HTMLElement>("#canvas-screen");

  if (!welcomeScreen || !photoScreen || !canvasScreen) {
    throw new Error("Atelier screens not found");
  }

  welcomeScreen.hidden = step !== 1;
  photoScreen.hidden = step !== 2;
  canvasScreen.hidden = step !== 3;

  atelierState.currentStep = step;
  updateProgress(step);
  sessionStorage.setItem("atelier-current-step", String(step));

  if (step === 3) {
    updateCanvasPreviews();
    document.dispatchEvent(new Event("atelier:canvas-screen-opened"));
  }

  if (step === 2) {
    document.dispatchEvent(new Event("atelier:photo-screen-opened"));
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

/**
 * Handles canvas shape selection.
 * Preserves the selected size unless the shape changes.
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

    // Reset the size only when switching to another shape.
    if (shapeChanged) {
      atelierState.canvas.width = null;
      atelierState.canvas.height = null;
      atelierState.canvas.sizeId = null;
    }

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

  selectShape(atelierState.canvas.shape);
}

/**
 * Connects the navigation buttons between Atelier screens.
 */
function initNavigation(): void {
  const choiceButtons = document.querySelectorAll<HTMLButtonElement>("[data-choice]");

  choiceButtons.forEach((button) => {
    button.addEventListener("click", () => goToStep(2));
  });

  document
    .querySelector<HTMLButtonElement>("#photo-back")
    ?.addEventListener("click", () => goToStep(1));

  document
    .querySelector<HTMLButtonElement>("#photo-continue")
    ?.addEventListener("click", () => goToStep(3));

  document
    .querySelector<HTMLButtonElement>("#canvas-back")
    ?.addEventListener("click", () => goToStep(2));
}

/**
 * Initialises the Atelier and restores the customer's photograph
 * before displaying their previously visited screen.
 */
async function startAtelier(): Promise<void> {
  initProgressNavigation();
  initNavigation();
  initPhotoUpload();
  initCanvasSizeSelection();
  initCanvasShapeSelection();
  initCanvasSizePreview();
  initCanvasSizePreview();
  initCanvasComposition();

  try {
    atelierState.portrait.photo = await loadPhoto();
  } catch {
    const feedback = document.querySelector<HTMLElement>("#upload-feedback");

    if (feedback) {
      feedback.textContent =
        "We couldn't restore your previous photograph. Please choose it again.";
    }
  }

  const savedStep = Number(sessionStorage.getItem("atelier-current-step"));

  const initialStep = [1, 2, 3].includes(savedStep) ? savedStep : 1;

  goToStep(initialStep);
}

void startAtelier();
