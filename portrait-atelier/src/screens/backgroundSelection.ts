import { getPetCutoutBlob } from "../app/petCutoutCache";
import { atelierState } from "../app/atelierState";
import { createGuidedAdvice } from "../components/guidedAdvice";
import { isUsingExamplePhotos } from "./photoUpload";
import { drawMultiPetComposition, preparePetCutout } from "../app/multiPetPreview";
import { loadBackgroundSelection, saveBackgroundSelection } from "../app/atelierChoiceStorage";
import { makeBlurredBackground } from "../app/graduatedBackground";
import { reconstructPetBackground } from "../app/reconstructPetBackground";

/**
 * Available background styles.
 */
export type BackgroundPreference = "original" | "softened" | "neutral" | "personal";

/**
 * Curated colours for the neutral background.
 */
export type BackgroundTone = "ivory" | "stone" | "sage" | "umber" | "blue";

/**
 * Customer's background preferences.
 */
export interface BackgroundSelection {
  preference: BackgroundPreference;
  tone: BackgroundTone;
  photo: File | null;
  notes: string;
  blurStrength: "soft" | "natural" | "dreamy";
  blurFade: number; // 0 = blur stays near the top, 100 = reaches the ground
  backgroundZoom: number; // 100–160 percent
  backgroundX: number; // position in preview pixels at 100% width
  backgroundY: number; // position in preview pixels at 100% height
}

/**
 * Background state for the current Atelier session.
 */
export const backgroundSelection: BackgroundSelection = {
  preference: "original",
  tone: "ivory",
  photo: null,
  notes: "",
  blurStrength: "natural",
  blurFade: 55,
  backgroundZoom: 100,
  backgroundX: 0,
  backgroundY: 0,
};

const EXAMPLE_MEADOW_PATHS = [
  "/images/examples/example-background-desktop.webp",
  "/images/example-background-desktop.webp",
];
const EXAMPLE_MEADOW_NAME = "atelier-example-meadow.webp";
const EXAMPLE_MEADOW_TIMESTAMP = 1_700_000_000_000;

const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const BACKGROUND_PREFERENCES: BackgroundPreference[] = [
  "original",
  "softened",
  "neutral",
  "personal",
];

const BACKGROUND_TONES: BackgroundTone[] = ["ivory", "stone", "sage", "umber", "blue"];

/**
 * Initialise Step 4 — Background Visualiser.
 */
export function initBackgroundSelection(): void {
  const preview = document.querySelector<HTMLElement>("#background-live-preview");

  const sceneImage = document.querySelector<HTMLImageElement>("#background-scene-image");

  const subjectImage = document.querySelector<HTMLImageElement>("#background-subject-image");

  const emptyMessage = document.querySelector<HTMLElement>("#background-empty-message");

  const previewFeedback = document.querySelector<HTMLElement>("#background-preview-feedback");

  const options = document.querySelectorAll<HTMLButtonElement>(".background-option");

  const swatches = document.querySelectorAll<HTMLButtonElement>(".background-swatch");

  const swatchPanel = document.querySelector<HTMLElement>("#background-swatches");

  const referencePanel = document.querySelector<HTMLElement>("#background-reference");

  const photoInput = document.querySelector<HTMLInputElement>("#background-photo");

  const uploadPreview = document.querySelector<HTMLElement>("#background-photo-preview");

  const uploadPreviewImage = document.querySelector<HTMLImageElement>("#background-preview-image");

  const removeButton = document.querySelector<HTMLButtonElement>("#remove-background-photo");

  const uploadFeedback = document.querySelector<HTMLElement>("#background-upload-feedback");

  const notesInput = document.querySelector<HTMLTextAreaElement>("#background-notes");
  const fineTune = document.querySelector<HTMLElement>("#background-finetune");
  const blurStrengthButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-blur-strength]")
  );
  const blurFadeInput = document.querySelector<HTMLInputElement>("#background-blur-fade");
  const blurFadeValue = document.querySelector<HTMLOutputElement>("#background-blur-fade-value");
  const personalPosition = document.querySelector<HTMLElement>("#background-personal-position");
  const backgroundZoomInput = document.querySelector<HTMLInputElement>("#background-zoom");
  const backgroundZoomValue = document.querySelector<HTMLOutputElement>("#background-zoom-value");
  const resetAdjustments = document.querySelector<HTMLButtonElement>(
    "#background-reset-adjustments"
  );

  if (
    !preview ||
    !sceneImage ||
    !subjectImage ||
    !emptyMessage ||
    !previewFeedback ||
    !swatchPanel ||
    !referencePanel ||
    !photoInput ||
    !uploadPreview ||
    !uploadPreviewImage ||
    !removeButton ||
    !uploadFeedback ||
    !notesInput ||
    !fineTune ||
    !blurFadeInput ||
    !blurFadeValue ||
    !personalPosition ||
    !backgroundZoomInput ||
    !backgroundZoomValue ||
    !resetAdjustments ||
    blurStrengthButtons.length !== 3 ||
    options.length !== 4 ||
    swatches.length !== 5
  ) {
    throw new Error("Background visualiser elements not found");
  }

  // The existing personal-background card doubles as an example-meadow card.
  // Reuse all its existing fine-tuning controls instead of introducing a second editor.
  const personalOption = Array.from(options).find(
    (button) => button.dataset.background === "personal"
  );
  const personalOptionTitle = personalOption?.querySelector<HTMLElement>(
    ".background-option-copy strong"
  );
  const personalOptionDescription = personalOption?.querySelector<HTMLElement>(
    ".background-option-copy span"
  );
  const personalOptionSymbol = personalOption?.querySelector<HTMLElement>(".thumbnail-symbol");

  const meadowCredit = document.createElement("p");
  meadowCredit.className = "example-photo-credits";
  meadowCredit.hidden = true;
  meadowCredit.append("Example meadow photo by ");
  const meadowCreditLink = document.createElement("a");
  meadowCreditLink.href = "https://unsplash.com/photos/field-of-green-trees--F5ik109zfU";
  meadowCreditLink.textContent = "Madeleine Wilson";
  meadowCreditLink.target = "_blank";
  meadowCreditLink.rel = "noopener noreferrer";
  meadowCredit.append(meadowCreditLink, " on Unsplash.");
  referencePanel.insertAdjacentElement("afterend", meadowCredit);

  // A stable File identity lets existing background caches work across revisits.
  let meadowPromise: Promise<File> | null = null;
  let meadowFile: File | null = null;
  let meadowRequestVersion = 0;
  let meadowLoading = false;

  function loadMeadow(): Promise<File> {
    if (!meadowPromise) {
      meadowPromise = (async () => {
        for (const url of EXAMPLE_MEADOW_PATHS) {
          const response = await fetch(url);
          if (!response.ok) continue;

          const blob = await response.blob();
          if (!blob.type.startsWith("image/") || blob.size === 0) continue;

          // Vite may return index.html for an unknown asset URL.
          // Check the image itself rather than trusting a successful response.
          try {
            const bitmap = await createImageBitmap(blob);
            bitmap.close();
          } catch {
            continue;
          }

          return new File([blob], EXAMPLE_MEADOW_NAME, {
            type: blob.type,
            lastModified: EXAMPLE_MEADOW_TIMESTAMP,
          });
        }
        throw new Error(
          "Example meadow not found. Check that example-background-desktop.webp " +
            "is in public/images/examples/ or public/images/."
        );
      })().catch((error: unknown) => {
        meadowPromise = null;
        throw error;
      });
    }
    return meadowPromise;
  }

  function selectExampleMeadow(): void {
    if (meadowLoading) return;
    meadowLoading = true;
    const version = ++meadowRequestVersion;
    void loadMeadow()
      .then((file) => {
        meadowFile = file;
        if (
          version !== meadowRequestVersion ||
          !isUsingExamplePhotos() ||
          backgroundSelection.preference !== "personal"
        )
          return;
        if (backgroundSelection.photo !== file) {
          backgroundSelection.photo = file;
          persistBackground();
        }
        render();
      })
      .catch((error: unknown) => {
        if (version !== meadowRequestVersion || !isUsingExamplePhotos()) return;
        elements.previewFeedback.textContent =
          error instanceof Error
            ? error.message
            : "The example meadow couldn't be loaded. Please try again.";
      })
      .finally(() => {
        meadowLoading = false;
      });
  }

  /** Keep demo scenery separate from customers' uploaded reference photos. */
  function syncExampleBackground(): void {
    const example = isUsingExamplePhotos();
    if (personalOptionTitle) {
      personalOptionTitle.textContent = example
        ? "Try the example meadow"
        : "Use my own background";
    }
    if (personalOptionDescription) {
      personalOptionDescription.textContent = example
        ? "Explore a meadow setting and make it your own with adjustments."
        : "Try a garden, favourite place or special scenery.";
    }
    if (personalOptionSymbol) personalOptionSymbol.textContent = example ? "✿" : "＋";
    if (personalOption) {
      personalOption.setAttribute(
        "aria-controls",
        example ? "background-finetune" : "background-reference"
      );
    }
    meadowCredit.hidden = !example || backgroundSelection.preference !== "personal";
    elements.referencePanel.hidden = example || backgroundSelection.preference !== "personal";
    elements.photoInput.disabled = example;

    // A demo image must never silently become a customer's background reference.
    if (!example && backgroundSelection.photo?.name === EXAMPLE_MEADOW_NAME) {
      backgroundSelection.photo = null;
      if (backgroundSelection.preference === "personal") {
        backgroundSelection.preference = "neutral";
      }
      persistBackground();
    }
    if (example && backgroundSelection.preference === "personal") {
      // Never carry a customer-uploaded scenery file into the example session.
      if (backgroundSelection.photo?.name !== EXAMPLE_MEADOW_NAME) {
        backgroundSelection.photo = null;
      }
      if (
        backgroundSelection.photo === null ||
        (meadowFile !== null && backgroundSelection.photo !== meadowFile)
      ) {
        // A restored File may have the same name; load the canonical example asset.
        selectExampleMeadow();
      }
    }
  }

  const elements = {
    preview,
    sceneImage,
    subjectImage,
    emptyMessage,
    previewFeedback,
    swatchPanel,
    referencePanel,
    photoInput,
    uploadPreview,
    uploadPreviewImage,
    removeButton,
    uploadFeedback,
    notesInput,
    fineTune,
    blurFadeInput,
    blurFadeValue,
    personalPosition,
    backgroundZoomInput,
    backgroundZoomValue,
    resetAdjustments,
  };

  // Keep the source image sharp at the bottom; fade in a separately blurred image
  // toward the top. Both layers use identical positioning and object-fit rules.
  const blurredImage = document.createElement("img");
  blurredImage.className = "background-graduated-blur";
  blurredImage.alt = "";
  blurredImage.hidden = true;
  elements.sceneImage.insertAdjacentElement("afterend", blurredImage);

  const blurredUrls = new WeakMap<File, Map<string, string>>();
  const blurredPending = new WeakMap<File, Set<string>>();
  let currentBlurFile: File | null = null;
  let currentBlurStrength = "";

  // Only for the single-pet Softened option. Generated once per photograph,
  // without running segmentation again; all other background modes are untouched.
  const reconstructedScenes = new WeakMap<File, { file: File; url: string }>();
  const reconstructionPending = new WeakSet<File>();
  const reconstructionFailed = new WeakSet<File>();

  function getReconstructedScene(photo: File): { file: File; url: string } | null {
    const cached = reconstructedScenes.get(photo);
    if (cached) return cached;
    if (reconstructionPending.has(photo) || reconstructionFailed.has(photo)) return null;

    reconstructionPending.add(photo);
    void getPetCutoutBlob(photo)
      .then((cutout) => reconstructPetBackground(photo, cutout))
      .then((sceneFile) => {
        reconstructedScenes.set(photo, {
          file: sceneFile,
          url: URL.createObjectURL(sceneFile),
        });
        if (atelierState.portrait.photo === photo && backgroundSelection.preference === "softened")
          render();
      })
      .catch((error: unknown) => {
        console.error("Could not reconstruct the pet-free background", error);
        reconstructionFailed.add(photo);
        if (
          atelierState.portrait.photo === photo &&
          backgroundSelection.preference === "softened"
        ) {
          elements.previewFeedback.textContent =
            "We couldn't rebuild the scenery for this photograph. Showing the original.";
        }
      })
      .finally(() => reconstructionPending.delete(photo));
    return null;
  }

  function getBlurredUrl(file: File): string | null {
    const strength = backgroundSelection.blurStrength;
    const cached = blurredUrls.get(file)?.get(strength);
    if (cached) return cached;

    let pending = blurredPending.get(file);
    if (!pending) {
      pending = new Set<string>();
      blurredPending.set(file, pending);
    }
    if (!pending.has(strength)) {
      pending.add(strength);
      void makeBlurredBackground(file, strength)
        .then((url) => {
          let versions = blurredUrls.get(file);
          if (!versions) {
            versions = new Map<string, string>();
            blurredUrls.set(file, versions);
          }
          versions.set(strength, url);
          if (currentBlurFile === file && currentBlurStrength === strength) render();
        })
        .catch(() => {
          if (currentBlurFile === file && currentBlurStrength === strength) {
            elements.previewFeedback.textContent =
              "The blur couldn't be prepared. Showing the original background.";
          }
        })
        .finally(() => pending?.delete(strength));
    }
    return null;
  }

  function setScenePhoto(file: File | null, originalUrl: string | null): void {
    const photographic =
      backgroundSelection.preference === "softened" ||
      backgroundSelection.preference === "personal";
    blurredImage.hidden = true;
    currentBlurFile = photographic ? file : null;
    currentBlurStrength = backgroundSelection.blurStrength;
    if (!file || !originalUrl) return;

    elements.sceneImage.src = originalUrl;
    elements.sceneImage.hidden = false;
    // Keep the underlying photograph SHARP. Only the graduated overlay
    // is blurred; otherwise the ground stays blurred even at 0%.
    elements.sceneImage.style.filter = "none";
    if (!photographic) return;

    const rawBlurUrl = getBlurredUrl(file);
    // The original photograph includes the dog. Never show its raw blurred
    // version underneath the pet, as that creates a soft duplicate/halo.
    const finalBlurUrl = rawBlurUrl;
    if (finalBlurUrl) {
      blurredImage.src = finalBlurUrl;
      blurredImage.hidden = false;
    }
  }

  function applyBlurFade(): void {
    const fade = Math.min(100, Math.max(0, backgroundSelection.blurFade));
    // Always fully blurred at the top. At 0 the bottom half stays sharp;
    // at 100 the blurred layer extends all the way toward the ground.
    const start = 0;
    const end = Math.round(35 + fade * 0.65);
    blurredImage.style.maskImage = `linear-gradient(to bottom, black ${start}%, transparent ${end}%)`;
    blurredImage.style.webkitMaskImage = blurredImage.style.maskImage;
  }

  function syncFineTune(): void {
    const mode = backgroundSelection.preference;
    const available = mode === "softened" || mode === "personal";
    elements.fineTune.hidden = !available;
    elements.personalPosition.hidden = mode !== "personal";
    blurStrengthButtons.forEach((button) => {
      const selected = button.dataset.blurStrength === backgroundSelection.blurStrength;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    elements.blurFadeInput.value = String(backgroundSelection.blurFade);
    elements.blurFadeValue.textContent = `${backgroundSelection.blurFade}%`;
    elements.backgroundZoomInput.value = String(backgroundSelection.backgroundZoom);
    elements.backgroundZoomValue.textContent = `${backgroundSelection.backgroundZoom}%`;
    elements.preview.classList.toggle(
      "is-background-draggable",
      mode === "personal" && Boolean(backgroundSelection.photo)
    );
    applyBlurFade();
  }

  // Multi-pet Step 4 uses the same normalized arrangement as Step 3.
  // The overlay is injected so the existing HTML does not need replacing.
  const multiImage = document.createElement("img");
  multiImage.className = "background-multi-pet-image";
  multiImage.alt = "Your arranged pets";
  multiImage.hidden = true;
  elements.preview.append(multiImage);
  let multiProcessing = false;
  let multiRequest = 0;
  let multiModeWasActive = false;
  let lastMultiPreviewKey = "";

  // Serialize IndexedDB writes; later changes must never be overwritten by earlier saves.
  let saveQueue: Promise<void> = Promise.resolve();
  let hasChangedBackground = false;

  function persistBackground(): void {
    hasChangedBackground = true;
    const snapshot = { ...backgroundSelection };
    saveQueue = saveQueue
      .catch(() => undefined)
      .then(() => saveBackgroundSelection(snapshot))
      .catch(() => {
        elements.uploadFeedback.textContent =
          "Your background is visible, but we couldn't save it for a future visit.";
      });
  }

  function setMultiPreviewImage(canvas: HTMLCanvasElement | null): void {
    if (!canvas) {
      multiImage.hidden = true;
      multiImage.removeAttribute("src");
      lastMultiPreviewKey = "";
      return;
    }
    // toDataURL is synchronous, so the image is updated before navigation.
    multiImage.src = canvas.toDataURL("image/png");
    multiImage.hidden = false;
  }

  async function prepareMultiPets(version: number): Promise<void> {
    if (multiProcessing) return;
    multiProcessing = true;
    try {
      const subjects = [...atelierState.portrait.subjects];
      for (let i = 0; i < subjects.length; i++) {
        if (version !== multiRequest) return;
        elements.previewFeedback.textContent = `Preparing pet ${i + 1} of ${subjects.length}…`;
        await preparePetCutout(subjects[i]);
      }
      if (version === multiRequest) render();
    } catch {
      if (version === multiRequest) {
        elements.previewFeedback.textContent =
          "We couldn't prepare every pet. Please return to Step 3 and check the photographs.";
      }
    } finally {
      multiProcessing = false;
    }
  }

  function renderMultiPets(): void {
    multiModeWasActive = true;
    const optionsForMultiple = options;
    optionsForMultiple.forEach((button) => {
      const unavailable =
        button.dataset.background === "original" || button.dataset.background === "softened";
      button.disabled = unavailable;
      button.setAttribute("aria-disabled", String(unavailable));
      button.title = unavailable
        ? "With several pets from different photos, choose a new shared background."
        : "";
    });

    if (
      backgroundSelection.preference === "original" ||
      backgroundSelection.preference === "softened"
    ) {
      backgroundSelection.preference = "neutral";
    }
    updateSceneryUrl();
    updateCanvasShape();
    renderOptions();
    renderSceneryUpload();
    elements.preview.dataset.mode = backgroundSelection.preference;
    elements.preview.dataset.display = "multi";
    applyBackgroundEffects();
    syncFineTune();
    elements.sceneImage.hidden = true;
    blurredImage.hidden = true;
    if (backgroundSelection.preference === "personal" && sceneryUrl && backgroundSelection.photo) {
      setScenePhoto(backgroundSelection.photo, sceneryUrl);
    }
    applySceneTransform();
    elements.subjectImage.hidden = true;
    elements.emptyMessage.hidden = true;

    // Render at the same aspect ratio as the displayed canvas.
    // Using the element's real height avoids stretching the transparent layer.
    const width = Math.max(1, Math.round(elements.preview.clientWidth || 380));
    const ratio = Number(elements.preview.style.aspectRatio) || 0.8;
    const measuredHeight = elements.preview.clientHeight;
    const height = Math.max(1, Math.round(measuredHeight || width / ratio));
    // A background style change does not alter the pet cutouts or positions.
    // Reuse the prepared overlay until the composition or preview size changes.
    const previewKey = JSON.stringify({
      width,
      height,
      subjects: atelierState.portrait.subjects.map((subject) => ({
        id: subject.id,
        file: [subject.photo.name, subject.photo.size, subject.photo.lastModified],
        position: subject.position,
        scale: subject.scale,
        rotation: subject.rotation,
        layer: subject.layer,
      })),
    });
    const needsDrawing = lastMultiPreviewKey !== previewKey || multiImage.hidden;
    const composite = needsDrawing ? drawMultiPetComposition(width, height) : null;
    if (needsDrawing && composite) {
      setMultiPreviewImage(composite);
      lastMultiPreviewKey = previewKey;
    }
    if (composite || !multiImage.hidden) {
      elements.previewFeedback.textContent =
        backgroundSelection.preference === "personal" && !sceneryUrl
          ? "Add your scenery photo to see your pets against it."
          : "Your arrangement from Step 3 is preserved.";
    } else {
      elements.previewFeedback.textContent = "Preparing your pets…";
      if (!multiProcessing) {
        const version = ++multiRequest;
        void prepareMultiPets(version);
      }
    }
  }

  // Original pet photograph.
  let currentPetFile: File | null = null;
  let petUrl: string | null = null;

  // Optional uploaded scenery.
  let currentSceneryFile: File | null = null;
  let sceneryUrl: string | null = null;

  // Transparent foreground generated by U²-Netp.
  let maskFile: File | null = null;
  let maskUrl: string | null = null;

  // Avoid processing the same photograph repeatedly.
  let processingFile: File | null = null;
  let failedFile: File | null = null;

  // Prevent outdated processing results from being applied.
  let processingVersion = 0;

  /**
   * Update the pet photograph URL only when the
   * customer chooses a different photograph.
   */
  function updatePetUrl(): void {
    const file = atelierState.portrait.photo;

    if (file === currentPetFile) {
      return;
    }

    if (petUrl) {
      URL.revokeObjectURL(petUrl);
    }

    if (maskUrl) {
      URL.revokeObjectURL(maskUrl);
    }

    currentPetFile = file;

    petUrl = file ? URL.createObjectURL(file) : null;

    maskFile = null;
    maskUrl = null;
    processingFile = null;
    failedFile = null;

    // Invalidate any processing result from an older photo.
    processingVersion++;
  }

  /**
   * Update the optional scenery photograph URL.
   */
  function updateSceneryUrl(): void {
    const file = backgroundSelection.photo;

    if (file === currentSceneryFile) {
      return;
    }

    if (sceneryUrl) {
      URL.revokeObjectURL(sceneryUrl);
    }

    currentSceneryFile = file;

    sceneryUrl = file ? URL.createObjectURL(file) : null;
  }

  /**
   * Match the preview to the canvas shape
   * and dimensions chosen in Step 3.
   */
  function updateCanvasShape(): void {
    const { width, height, shape } = atelierState.canvas;

    let aspectRatio: number;

    if (width !== null && height !== null && width > 0 && height > 0) {
      aspectRatio = width / height;
    } else {
      switch (shape) {
        case "portrait":
          aspectRatio = 4 / 5;
          break;

        case "landscape":
          aspectRatio = 5 / 4;
          break;

        case "square":
          aspectRatio = 1;
          break;
      }
    }

    elements.preview.style.aspectRatio = String(aspectRatio);
  }

  /**
   * Curated mottled backgrounds for portrait previews.
   */
  const backgroundColours: Record<BackgroundTone, { top: string; middle: string; bottom: string }> =
    {
      ivory: {
        top: "#EBDCC7",
        middle: "#C5AA8C",
        bottom: "#85705D",
      },
      stone: {
        top: "#E3DED3",
        middle: "#B5A99B",
        bottom: "#6F645A",
      },
      sage: {
        top: "#CCD1B5",
        middle: "#899374",
        bottom: "#454F38",
      },
      umber: {
        top: "#D9B38D",
        middle: "#9A7656",
        bottom: "#503B2D",
      },
      blue: {
        top: "#C6D2D2",
        middle: "#8B9FA6",
        bottom: "#4B626D",
      },
    };

  /**
   * Applies the selected background effect.
   * Keeps visual effects independent of the pet mask.
   */
  function applyBackgroundEffects(): void {
    const mode = backgroundSelection.preference;
    const scene = elements.preview.querySelector<HTMLElement>("#background-scene");

    if (!scene) {
      throw new Error("Background scene element not found");
    }

    // Visual blur is controlled exclusively in src/styles/background.css.
    scene.style.backgroundImage = "";
    scene.style.backgroundColor = "";

    if (mode === "neutral") {
      const colour = backgroundColours[backgroundSelection.tone];

      scene.style.backgroundColor = colour.middle;

      scene.style.backgroundImage = `
    radial-gradient(
      ellipse at 18% 18%,
      rgba(255, 250, 236, 0.38),
      transparent 52%
    ),
    radial-gradient(
      ellipse at 82% 30%,
      rgba(255, 244, 222, 0.22),
      transparent 48%
    ),
    radial-gradient(
      ellipse at 24% 75%,
      rgba(62, 47, 37, 0.18),
      transparent 54%
    ),
    radial-gradient(
      ellipse at 80% 88%,
      rgba(47, 37, 29, 0.24),
      transparent 55%
    ),
    linear-gradient(
      180deg,
      ${colour.top} 0%,
      ${colour.middle} 50%,
      ${colour.bottom} 100%
    )
  `;
    }
  }

  function applySceneTransform(): void {
    const factor = 1.06 * (backgroundSelection.backgroundZoom / 100);
    const x = (backgroundSelection.backgroundX * (elements.preview.clientWidth || 350)) / 100;
    const y = (backgroundSelection.backgroundY * (elements.preview.clientHeight || 430)) / 100;
    const transform = `translate(${x}px, ${y}px) scale(${factor})`;
    elements.sceneImage.style.transform = transform;
    blurredImage.style.transform = transform;
  }

  /**
   * Applies the composition from Step 3.
   *
   * Original photo and pet foreground use matching
   * positioning. Blurred backgrounds are enlarged
   * slightly to avoid visible blur edges.
   */
  function updateComposition(): void {
    const { zoom, offsetX, offsetY } = atelierState.composition;

    const safeZoom = Math.min(3, Math.max(1, Number(zoom) || 1));

    const previewWidth = elements.preview.clientWidth || 350;

    const scaleFactor = previewWidth / 300;

    const x = (Number(offsetX) || 0) * scaleFactor;
    const y = (Number(offsetY) || 0) * scaleFactor;

    const compositionTransform = `translate(${x}px, ${y}px) scale(${safeZoom})`;

    // The separated pet retains the original composition.
    elements.subjectImage.style.transform = compositionTransform;

    switch (backgroundSelection.preference) {
      case "original":
      case "neutral":
        elements.sceneImage.style.transform = compositionTransform;
        blurredImage.style.transform = compositionTransform;
        break;

      case "softened":
        // Keep the original scene and both photographic layers pixel-aligned
        // with the pet cutout. Enlarging the background independently creates
        // a visible blurred duplicate around the animal's silhouette.
        elements.sceneImage.style.transform = compositionTransform;
        blurredImage.style.transform = compositionTransform;
        break;

      case "personal":
        // Uploaded scenery fills the canvas independently and can be moved.
        applySceneTransform();
        break;
    }
  }

  /**
   * Generate a transparent pet foreground using
   * our own U²-Netp / ONNX Runtime Web service.
   *
   * The original photograph is never modified.
   */
  async function prepareForeground(file: File, version: number): Promise<void> {
    if (processingFile === file || maskFile === file || failedFile === file) {
      return;
    }

    processingFile = file;

    elements.previewFeedback.textContent = "Preparing your background preview…";

    try {
      // Calls src/services/backgroundRemoval.ts
      const transparentImage = await getPetCutoutBlob(file);

      // Ignore results from an old photograph.
      if (version !== processingVersion || atelierState.portrait.photo !== file) {
        return;
      }

      if (maskUrl) {
        URL.revokeObjectURL(maskUrl);
      }

      maskUrl = URL.createObjectURL(transparentImage);
      maskFile = file;
      failedFile = null;

      render();
    } catch {
      if (version === processingVersion && atelierState.portrait.photo === file) {
        failedFile = file;

        elements.previewFeedback.textContent =
          "We couldn't separate your pet automatically. " +
          "You can still use your original photograph.";
      }
    } finally {
      if (version === processingVersion) {
        processingFile = null;
      }
    }
  }

  // Guide Me stays beside the selected option, not above the entire screen.
  // This is advice only: it never changes the customer's background preference.
  const guidance = createGuidedAdvice({ id: "background-guidance" });
  guidance.element.classList.add("background-guided-advice");

  /** Updates artist advice without altering the selected background. */
  function updateGuidedAdvice(): void {
    guidance.syncVisibility();
    if (guidance.element.hidden) return;

    const multiplePets = atelierState.portrait.subjects.length > 1;
    const advice: Record<BackgroundPreference, string> = {
      original:
        "Keep the original setting when it is part of the memory you want to preserve. " +
        "I'll make sure your pet remains the focus.",
      softened:
        "Softening the surroundings can draw attention to your pet's expression " +
        "while keeping the feeling of the original photograph.",
      neutral: multiplePets
        ? "A simple, shared background helps bring pets from different photographs " +
          "together naturally, without competing with their expressions."
        : "A softly mottled background is a timeless choice when you want " +
          "your pet's personality to take centre stage.",
      personal: isUsingExamplePhotos()
        ? "Try adjusting the meadow's softness and position to find the feeling you like. " +
          "These are ideas for your portrait, not fixed painting instructions."
        : "A favourite garden or meaningful place can make a portrait even more personal. " +
          "You can upload a separate scenery photograph to explore the idea.",
    };
    guidance.update(advice[backgroundSelection.preference]);

    // Place the note directly after the selected card in the options column.
    const selectedButton = Array.from(options).find(
      (button) => button.dataset.background === backgroundSelection.preference
    );
    const selectedCard = selectedButton?.closest<HTMLElement>(".background-option-card");
    if (selectedCard) selectedCard.insertAdjacentElement("afterend", guidance.element);
  }

  /**
   * Update selected background cards and swatches.
   */
  function renderOptions(): void {
    options.forEach((button) => {
      const selected = button.dataset.background === backgroundSelection.preference;

      button.classList.toggle("is-selected", selected);

      button.setAttribute("aria-pressed", String(selected));
    });

    swatches.forEach((button) => {
      const selected = button.dataset.tone === backgroundSelection.tone;

      button.classList.toggle("is-selected", selected);

      button.setAttribute("aria-pressed", String(selected));
    });

    elements.swatchPanel.hidden = backgroundSelection.preference !== "neutral";

    elements.referencePanel.hidden =
      isUsingExamplePhotos() || backgroundSelection.preference !== "personal";

    elements.preview.dataset.tone = backgroundSelection.tone;
    updateGuidedAdvice();
  }

  /**
   * Display the uploaded scenery thumbnail.
   */
  function renderSceneryUpload(): void {
    if (!sceneryUrl) {
      elements.uploadPreview.hidden = true;

      elements.uploadPreviewImage.removeAttribute("src");
      return;
    }

    elements.uploadPreviewImage.src = sceneryUrl;
    elements.uploadPreview.hidden = false;
  }

  /**
   * Render the original photograph without changes.
   */
  function renderOriginal(): void {
    if (!petUrl) {
      return;
    }

    elements.sceneImage.src = petUrl;
    elements.sceneImage.hidden = false;
    elements.sceneImage.style.filter = "none";
    blurredImage.hidden = true;

    elements.subjectImage.hidden = true;

    elements.preview.dataset.display = "original";

    elements.previewFeedback.textContent = "";

    updateComposition();
  }

  /**
   * Display the current visualisation.
   */
  function render(): void {
    syncExampleBackground();
    if (atelierState.portrait.subjects.length > 1) {
      renderMultiPets();
      return;
    }
    if (multiModeWasActive) {
      multiModeWasActive = false;
      ++multiRequest;
      setMultiPreviewImage(null);
      options.forEach((button) => {
        button.disabled = false;
        button.removeAttribute("aria-disabled");
        button.removeAttribute("title");
      });
    }
    updatePetUrl();
    updateSceneryUrl();
    updateCanvasShape();
    renderOptions();
    renderSceneryUpload();
    syncFineTune();
    blurredImage.hidden = true;

    const mode = backgroundSelection.preference;
    const file = atelierState.portrait.photo;

    elements.preview.dataset.mode = mode;
    // Never leave the previous softened filter applied when changing styles.
    elements.sceneImage.style.filter = "none";
    applyBackgroundEffects();

    const hasPhoto = Boolean(file && petUrl);

    elements.emptyMessage.hidden = hasPhoto;

    if (!hasPhoto || !petUrl) {
      elements.sceneImage.hidden = true;
      elements.subjectImage.hidden = true;

      elements.sceneImage.removeAttribute("src");
      elements.subjectImage.removeAttribute("src");

      elements.previewFeedback.textContent = "";

      return;
    }

    // Original background requires no AI processing.
    if (mode === "original") {
      renderOriginal();
      return;
    }

    const foregroundReady = maskFile === file && maskUrl !== null;

    if (!foregroundReady || !maskUrl) {
      // Keep the photograph visible while
      // the transparent foreground is prepared.
      elements.sceneImage.src = petUrl;
      elements.sceneImage.hidden = false;

      elements.subjectImage.hidden = true;

      elements.preview.dataset.display = "original";

      updateComposition();

      if (file && processingFile !== file && failedFile !== file) {
        const version = processingVersion;

        void prepareForeground(file, version);
      }

      if (failedFile === file) {
        elements.previewFeedback.textContent =
          "Background removal wasn't successful. " + "Your original photograph is preserved.";
      }

      return;
    }

    // Foreground is ready.
    elements.preview.dataset.display = "composite";

    elements.subjectImage.src = maskUrl;
    elements.subjectImage.hidden = false;

    switch (mode) {
      case "softened": {
        // Never blur the dog itself into the scenery. Reconstruct a pet-free
        // background first, then layer the sharp cutout over its graduated blur.
        const reconstructed = file ? getReconstructedScene(file) : null;
        if (reconstructed) {
          setScenePhoto(reconstructed.file, reconstructed.url);
        } else {
          // Show the original photo while the lightweight local fill runs.
          // Do not render a blurred duplicate of the dog during preparation.
          currentBlurFile = null;
          elements.sceneImage.src = petUrl;
          elements.sceneImage.hidden = false;
          blurredImage.hidden = true;
          if (file && !reconstructionFailed.has(file)) {
            elements.previewFeedback.textContent = "Preparing the softened background…";
          }
        }
        break;
      }

      case "neutral":
        // CSS generates the warm mottled background.
        elements.sceneImage.hidden = true;
        break;

      case "personal":
        if (sceneryUrl && backgroundSelection.photo) {
          setScenePhoto(backgroundSelection.photo, sceneryUrl);
        } else {
          // Show neutral fallback until scenery is uploaded.
          elements.sceneImage.hidden = true;
        }
        break;
    }

    const waitingForScene =
      mode === "softened" &&
      file &&
      !reconstructedScenes.has(file) &&
      !reconstructionFailed.has(file);
    elements.previewFeedback.textContent = waitingForScene
      ? "Preparing the softened background…"
      : mode === "softened" && file && reconstructionFailed.has(file)
        ? "We couldn't rebuild the scenery for this photograph. Showing the original."
        : mode === "personal" && !sceneryUrl
          ? "Add a scenery photograph to preview your background."
          : "";

    updateComposition();
  }

  /**
   * Handle background preference buttons.
   */
  options.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.background;

      if (!BACKGROUND_PREFERENCES.includes(value as BackgroundPreference)) {
        return;
      }

      backgroundSelection.preference = value as BackgroundPreference;
      persistBackground();
      render();
    });
  });

  /**
   * Handle neutral background colour variations.
   */
  swatches.forEach((button) => {
    button.addEventListener("click", () => {
      const tone = button.dataset.tone;

      if (!BACKGROUND_TONES.includes(tone as BackgroundTone)) {
        return;
      }

      backgroundSelection.tone = tone as BackgroundTone;
      persistBackground();
      render();
    });
  });

  /**
   * Validate and store the uploaded scenery.
   */
  elements.photoInput.addEventListener("change", () => {
    if (isUsingExamplePhotos()) {
      elements.photoInput.value = "";
      return;
    }
    const file = elements.photoInput.files?.[0];

    if (!file) {
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      elements.uploadFeedback.textContent = "Please choose a JPG, PNG or WebP photograph.";

      elements.photoInput.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      elements.uploadFeedback.textContent = "The photograph must be 15 MB or smaller.";

      elements.photoInput.value = "";
      return;
    }

    backgroundSelection.photo = file;
    persistBackground();

    elements.uploadFeedback.textContent = "Background photograph added.";

    render();
  });

  /**
   * Remove the uploaded background reference.
   */
  elements.removeButton.addEventListener("click", () => {
    backgroundSelection.photo = null;
    persistBackground();

    elements.photoInput.value = "";
    elements.uploadFeedback.textContent = "";

    render();
  });

  // Fine-tuning affects only the scenery, never the pet foreground.
  blurStrengthButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const choice = button.dataset.blurStrength;
      if (choice !== "soft" && choice !== "natural" && choice !== "dreamy") return;
      backgroundSelection.blurStrength = choice;
      persistBackground();
      render();
    });
  });

  elements.blurFadeInput.addEventListener("input", () => {
    backgroundSelection.blurFade = Number(elements.blurFadeInput.value);
    applyBlurFade();
    elements.blurFadeValue.textContent = `${backgroundSelection.blurFade}%`;
  });
  elements.blurFadeInput.addEventListener("change", persistBackground);

  elements.backgroundZoomInput.addEventListener("input", () => {
    backgroundSelection.backgroundZoom = Number(elements.backgroundZoomInput.value);
    elements.backgroundZoomValue.textContent = `${backgroundSelection.backgroundZoom}%`;
    applySceneTransform();
  });
  elements.backgroundZoomInput.addEventListener("change", persistBackground);

  elements.resetAdjustments.addEventListener("click", () => {
    backgroundSelection.blurStrength = "natural";
    backgroundSelection.blurFade = 55;
    backgroundSelection.backgroundZoom = 100;
    backgroundSelection.backgroundX = 0;
    backgroundSelection.backgroundY = 0;
    persistBackground();
    render();
  });

  // Move personal backgrounds directly on the preview. Pointer events also
  // support touch. A drag never changes the pet arrangement.
  let drag: { pointerId: number; x: number; y: number; startX: number; startY: number } | null =
    null;
  elements.preview.addEventListener("pointerdown", (event: PointerEvent) => {
    if (backgroundSelection.preference !== "personal" || !backgroundSelection.photo) return;
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: backgroundSelection.backgroundX,
      startY: backgroundSelection.backgroundY,
    };
    elements.preview.setPointerCapture(event.pointerId);
  });
  elements.preview.addEventListener("pointermove", (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = Math.max(1, elements.preview.clientWidth);
    const height = Math.max(1, elements.preview.clientHeight);
    backgroundSelection.backgroundX = Math.max(
      -35,
      Math.min(35, drag.startX + ((event.clientX - drag.x) / width) * 100)
    );
    backgroundSelection.backgroundY = Math.max(
      -35,
      Math.min(35, drag.startY + ((event.clientY - drag.y) / height) * 100)
    );
    applySceneTransform();
  });
  function finishDrag(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    if (elements.preview.hasPointerCapture(event.pointerId)) {
      elements.preview.releasePointerCapture(event.pointerId);
    }
    persistBackground();
  }
  elements.preview.addEventListener("pointerup", finishDrag);
  elements.preview.addEventListener("pointercancel", finishDrag);

  /**
   * Keep the customer's written idea.
   */
  elements.notesInput.addEventListener("input", () => {
    backgroundSelection.notes = elements.notesInput.value;
    persistBackground();
  });

  /**
   * Refresh the preview when entering Step 4.
   */
  document.addEventListener("atelier:background-screen-opened", () => {
    elements.notesInput.value = backgroundSelection.notes;

    render();
  });

  /**
   * Update composition when the preview resizes.
   */
  document.addEventListener("atelier:composition-changed", () => {
    if (atelierState.portrait.subjects.length > 1) render();
  });
  document.addEventListener("atelier:cutout-ready", () => {
    lastMultiPreviewKey = "";
    if (atelierState.portrait.subjects.length > 1) render();
  });
  const resizeObserver = new ResizeObserver(() => {
    if (atelierState.portrait.subjects.length > 1) renderMultiPets();
    else updateComposition();
  });

  resizeObserver.observe(elements.preview);

  // Restore previous background choices and an uploaded scenery file.
  // If the customer changes an option while the database loads, keep their new choice.
  void (async () => {
    try {
      const saved = await loadBackgroundSelection();
      if (!saved || hasChangedBackground) return;
      Object.assign(backgroundSelection, saved);
      backgroundSelection.blurStrength = ["soft", "natural", "dreamy"].includes(
        backgroundSelection.blurStrength
      )
        ? backgroundSelection.blurStrength
        : "natural";
      backgroundSelection.blurFade = Number.isFinite(backgroundSelection.blurFade)
        ? Math.max(0, Math.min(100, backgroundSelection.blurFade))
        : 55;
      backgroundSelection.backgroundZoom = Number.isFinite(backgroundSelection.backgroundZoom)
        ? Math.max(100, Math.min(160, backgroundSelection.backgroundZoom))
        : 100;
      backgroundSelection.backgroundX = Number.isFinite(backgroundSelection.backgroundX)
        ? backgroundSelection.backgroundX
        : 0;
      backgroundSelection.backgroundY = Number.isFinite(backgroundSelection.backgroundY)
        ? backgroundSelection.backgroundY
        : 0;
      elements.notesInput.value = backgroundSelection.notes;
      const notesDetails = elements.notesInput.closest<HTMLDetailsElement>(
        ".background-notes-details"
      );
      if (notesDetails && backgroundSelection.notes.trim()) notesDetails.open = true;
      render();
    } catch {
      elements.uploadFeedback.textContent =
        "We couldn't restore your previous background selection.";
    }
  })();

  // Initialise with the current photograph.
  render();
}
