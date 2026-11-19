import {
  preloadPetCutouts,
  getPetCutoutStatus,
  type PetCutoutStatus,
} from "../app/multiPetPreview";
import { atelierState, createPortraitSubject } from "../app/atelierState";
import type { PortraitSubject } from "../app/atelierState";
import {
  deletePhoto,
  loadPhoto,
  loadPortraitSubjects,
  savePhoto,
  savePortraitSubjects,
} from "../app/photoStorage";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_PETS = 3;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
type UploadMode = "one" | "several";

/**
 * Step 2 — One pet or several pets.
 * Existing single-pet screens continue to use portrait.photo.
 * Later, the composition editor will use portrait.subjects.
 */
export function initPhotoUpload(): void {
  const photoInput = document.querySelector<HTMLInputElement>("#pet-photo");
  const uploadLabel = document.querySelector<HTMLElement>(".photo-upload-label");
  const uploadTitle = document.querySelector<HTMLElement>("#photo-upload-title");
  const uploadDescription = document.querySelector<HTMLElement>("#photo-upload-description");
  const preview = document.querySelector<HTMLElement>("#photo-preview");
  const previewImage = document.querySelector<HTMLImageElement>("#photo-preview-image");
  const changeButton = document.querySelector<HTMLButtonElement>("#change-photo");
  const list = document.querySelector<HTMLElement>("#pet-photo-list");
  const feedback = document.querySelector<HTMLElement>("#upload-feedback");
  const assistance = document.querySelector<HTMLElement>("#photo-assistance-note");
  const modeButtons = document.querySelectorAll<HTMLButtonElement>("[data-pet-count]");

  if (
    !photoInput || !uploadLabel || !uploadTitle || !uploadDescription ||
    !preview || !previewImage || !changeButton || !list || !feedback ||
    !assistance || modeButtons.length !== 2
  ) {
    throw new Error("Photograph upload elements not found");
  }

  const elements = {
    photoInput,
    uploadLabel,
    uploadTitle,
    uploadDescription,
    preview,
    previewImage,
    changeButton,
    list,
    feedback,
    assistance,
  };

  let mode: UploadMode = "one";
  let hasLocalEdits = false;
  let previewUrls: string[] = [];
  let saveQueue: Promise<void> = Promise.resolve();

  /** Add progress feedback inside the photo preview, not as a separate panel. */
  function createPreparationBadge(subjectId: string): HTMLElement {
    const badge = document.createElement("span");
    badge.className = "photo-preparation-badge";
    badge.dataset.subjectId = subjectId;
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-live", "polite");
    return badge;
  }

  function updatePreparationBadges(): void {
    const subjects = atelierState.portrait.subjects;
    const labels: Record<PetCutoutStatus, string> = {
      idle: "Preparing soon…",
      preparing: "Preparing portrait…",
      ready: "Ready for your canvas",
      error: "Preview preparation failed",
    };
    for (const badge of Array.from(document.querySelectorAll<HTMLElement>(".photo-preparation-badge"))) {
      const subject = subjects.find((item) => item.id === badge.dataset.subjectId);
      if (!subject) continue;
      const state = getPetCutoutStatus(subject);
      badge.dataset.status = state;
      badge.textContent = labels[state];
    }
  }

  /** Update the dashed upload area while one or more pets are processing. */
  function updateUploadAreaStatus(): void {
    const subjects = atelierState.portrait.subjects;
    const activeCount = subjects.filter((subject) => {
      const status = getPetCutoutStatus(subject);
      return status === "preparing" || status === "idle";
    }).length;

    const isVisible = !elements.uploadLabel.hidden && activeCount > 0;
    uploadAreaStatus.hidden = !isVisible;
    elements.uploadLabel.classList.toggle("is-preparing-photos", isVisible);

    if (isVisible) {
      uploadAreaMessage.textContent = activeCount === 1
        ? "Preparing your photograph…"
        : `Preparing ${activeCount} photographs…`;
    }
  }

  // Overlay is added to the existing dashed upload area, without changing its markup.
  const uploadAreaStatus = document.createElement("span");
  uploadAreaStatus.className = "photo-upload-area-status";
  uploadAreaStatus.hidden = true;
  uploadAreaStatus.setAttribute("role", "status");
  uploadAreaStatus.setAttribute("aria-live", "polite");

  const uploadAreaSpinner = document.createElement("span");
  uploadAreaSpinner.className = "photo-upload-area-spinner";
  uploadAreaSpinner.setAttribute("aria-hidden", "true");

  const uploadAreaMessage = document.createElement("span");
  uploadAreaMessage.className = "photo-upload-area-message";

  const uploadAreaHint = document.createElement("span");
  uploadAreaHint.className = "photo-upload-area-hint";
  uploadAreaHint.textContent = "You can continue while we prepare your pets.";

  uploadAreaStatus.append(uploadAreaSpinner, uploadAreaMessage, uploadAreaHint);
  elements.uploadLabel.append(uploadAreaStatus);

  // Status changes are dispatched by the shared cutout preparation service.
  document.addEventListener("atelier:cutout-status", () => {
    updatePreparationBadges();
    updateUploadAreaStatus();
  });


  function clearPreviewUrls(): void {
    for (const url of previewUrls) URL.revokeObjectURL(url);
    previewUrls = [];
  }

  function getPreviewUrl(file: File): string {
    const url = URL.createObjectURL(file);
    previewUrls.push(url);
    return url;
  }

  function synchroniseLegacyPhoto(): void {
    const subjects = atelierState.portrait.subjects;
    atelierState.portrait.photo = subjects[0]?.photo ?? null;
    atelierState.portrait.numberOfPets = subjects.length || null;
  }

  /** Serialise writes so a quick sequence of edits cannot restore old data. */
  function persist(): void {
    const snapshot = [...atelierState.portrait.subjects];
    const firstPhoto = snapshot[0]?.photo ?? null;

    saveQueue = saveQueue
      .catch(() => {
        // A previous write failed; still attempt the latest one.
      })
      .then(async () => {
        await savePortraitSubjects(snapshot);
        if (firstPhoto) {
          await savePhoto(firstPhoto);
        } else {
          await deletePhoto();
        }
      })
      .catch(() => {
        elements.feedback.textContent =
          "Your photos are available now, but they couldn't be saved for a future visit.";
      });
  }

  function announce(message: string): void {
    elements.feedback.textContent = message;
  }

  function makeButton(text: string, className: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
  }

  /** Render cards with DOM elements, not HTML strings. */
  function renderSubjects(subjects: PortraitSubject[]): void {
    elements.list.replaceChildren();

    for (let index = 0; index < subjects.length; index++) {
      const subject = subjects[index];
      const card = document.createElement("article");
      card.className = "pet-photo-card";

      const image = document.createElement("img");
      image.src = getPreviewUrl(subject.photo);
      image.alt = subject.name ? `Photo of ${subject.name}` : `Pet ${index + 1} photograph`;
      const imageFrame = document.createElement("div");
      imageFrame.className = "pet-photo-image-frame";
      imageFrame.append(image, createPreparationBadge(subject.id));
      card.append(imageFrame);

      const details = document.createElement("div");
      details.className = "pet-photo-details";

      const label = document.createElement("label");
      label.htmlFor = `pet-name-${subject.id}`;
      label.textContent = `Pet ${index + 1} · name (optional)`;

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.id = `pet-name-${subject.id}`;
      nameInput.maxLength = 60;
      nameInput.placeholder = "Pet's name";
      nameInput.value = subject.name;
      nameInput.addEventListener("change", () => {
        subject.name = nameInput.value.trim();
        persist();
      });

      const filename = document.createElement("small");
      filename.className = "pet-photo-filename";
      filename.textContent = subject.photo.name;

      const removeButton = makeButton("Remove pet", "pet-photo-remove", () => {
        hasLocalEdits = true;
        atelierState.portrait.subjects = atelierState.portrait.subjects.filter(
          (entry) => entry.id !== subject.id,
        );
        synchroniseLegacyPhoto();
        persist();
        render();
        document.dispatchEvent(new Event("atelier:subjects-changed"));
        announce("Photograph removed.");
      });

      details.append(label, nameInput, filename, removeButton);
      card.append(details);
      elements.list.append(card);
    }
  }

  function render(): void {
    const subjects = atelierState.portrait.subjects;
    if (subjects.length > 1) mode = "several";

    modeButtons.forEach((button) => {
      const selected = button.dataset.petCount === mode;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    elements.photoInput.multiple = mode === "several";
    elements.assistance.hidden = mode !== "several";

    clearPreviewUrls();
    elements.previewImage.removeAttribute("src");
    elements.list.replaceChildren();

    const showSinglePreview = mode === "one" && subjects.length === 1;
    elements.preview.hidden = !showSinglePreview;
    elements.list.hidden = mode !== "several" || subjects.length === 0;
    elements.uploadLabel.hidden = showSinglePreview ||
      (mode === "several" && subjects.length >= MAX_PETS);

    if (showSinglePreview) {
      let frame = elements.preview.querySelector<HTMLElement>(".single-photo-image-frame");
      if (!frame) {
        frame = document.createElement("div");
        frame.className = "single-photo-image-frame";
        elements.previewImage.before(frame);
        frame.append(elements.previewImage);
      }
      frame.querySelector(".photo-preparation-badge")?.remove();
      frame.append(createPreparationBadge(subjects[0].id));
      elements.previewImage.src = getPreviewUrl(subjects[0].photo);
      elements.previewImage.alt = subjects[0].name
        ? `Photograph of ${subjects[0].name}`
        : "Your selected pet photograph";
    } else if (mode === "several") {
      renderSubjects(subjects);
    }

    updatePreparationBadges();
    updateUploadAreaStatus();

    elements.uploadTitle.textContent = mode === "several"
      ? subjects.length ? "Add another pet" : "Choose your pets' photographs"
      : "Choose a photograph";
    elements.uploadDescription.textContent = mode === "several"
      ? `Choose up to ${MAX_PETS} photographs, one for each pet`
      : "Tap here to select a photo from your device";
  }

  function validPhoto(file: File): boolean {
    if (!ALLOWED_TYPES.has(file.type)) {
      announce("Please choose JPG, PNG or WebP photographs.");
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      announce("Each photograph must be smaller than 15 MB.");
      return false;
    }
    return true;
  }

  function handlePhotos(files: File[]): void {
    if (files.length === 0) return;
    if (!files.every(validPhoto)) return;

    if (mode === "one") {
      const original = atelierState.portrait.subjects[0];
      const replacement = createPortraitSubject(files[0], original?.name ?? "");
      // Preserve a subject's ID/position when changing just its photo.
      if (original) {
        replacement.id = original.id;
        replacement.position = { ...original.position };
        replacement.scale = original.scale;
        replacement.rotation = original.rotation;
        replacement.layer = original.layer;
        replacement.referencePhotos = original.referencePhotos;
      }
      atelierState.portrait.subjects = [replacement];
    } else {
      const available = MAX_PETS - atelierState.portrait.subjects.length;
      if (available <= 0) {
        announce(`You can add up to ${MAX_PETS} pets in this first version.`);
        return;
      }
      if (files.length > available) {
        announce(`You can add ${available} more ${available === 1 ? "pet" : "pets"}.`);
        return;
      }
      for (const file of files) {
        const subject = createPortraitSubject(file);
        atelierState.portrait.subjects.push(subject);
      }
    }

    hasLocalEdits = true;
    synchroniseLegacyPhoto();
    persist();
    render();
    document.dispatchEvent(new Event("atelier:subjects-changed"));
    preloadPetCutouts();
    announce(atelierState.portrait.subjects.length === 1
      ? "Photograph added successfully."
      : `${atelierState.portrait.subjects.length} pet photographs added.`);
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const requested = button.dataset.petCount;
      if (requested !== "one" && requested !== "several") return;
      if (requested === "one" && atelierState.portrait.subjects.length > 1) {
        announce("Remove extra pets before switching to one pet. Your photos are kept safe.");
        return;
      }
      mode = requested;
      announce("");
      render();
    });
  });

  elements.photoInput.addEventListener("change", () => {
    handlePhotos(Array.from(elements.photoInput.files ?? []));
    elements.photoInput.value = "";
  });

  elements.uploadLabel.addEventListener("dragover", (event: DragEvent) => {
    event.preventDefault();
    elements.uploadLabel.classList.add("is-dragging");
  });
  elements.uploadLabel.addEventListener("dragleave", () => {
    elements.uploadLabel.classList.remove("is-dragging");
  });
  elements.uploadLabel.addEventListener("drop", (event: DragEvent) => {
    event.preventDefault();
    elements.uploadLabel.classList.remove("is-dragging");
    handlePhotos(Array.from(event.dataTransfer?.files ?? []));
  });

  elements.changeButton.addEventListener("click", () => {
    elements.photoInput.value = "";
    elements.photoInput.click();
  });

  document.addEventListener("atelier:photo-screen-opened", render);

  // Load saved subjects; migrate an older single-photo session if necessary.
  void (async () => {
    try {
      const storedSubjects = await loadPortraitSubjects();
      if (hasLocalEdits) return;

      if (storedSubjects.length > 0) {
        atelierState.portrait.subjects = storedSubjects;
      } else {
        const legacy = atelierState.portrait.photo ?? await loadPhoto();
        if (hasLocalEdits) return;
        if (legacy) {
          atelierState.portrait.subjects = [createPortraitSubject(legacy)];
          persist();
        }
      }
      synchroniseLegacyPhoto();
      render();
      document.dispatchEvent(new Event("atelier:subjects-changed"));
      preloadPetCutouts();
    } catch {
      announce("We couldn't restore previous photographs. You can choose them again.");
    }
  })();

  render();
}
