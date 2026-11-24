import {
  preloadPetCutouts,
  getPetCutoutStatus,
  type PetCutoutStatus,
} from "../app/multiPetPreview";
import { atelierState, createPortraitSubject } from "../app/atelierState";
import type { PortraitSubject } from "../app/atelierState";
import { getPetCutoutBlob } from "../app/petCutoutCache";
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
const EXAMPLE_STORAGE_KEY = "atelier-example-photos-v1";
const EXAMPLE_FILENAMES = new Set(["atelier-example-dog.webp", "atelier-example-cat.webp"]);

/** Identifies a demonstration session for the future enquiry flow. */
export function isUsingExamplePhotos(): boolean {
  try {
    return (
      localStorage.getItem(EXAMPLE_STORAGE_KEY) === "true" &&
      atelierState.portrait.subjects.length > 0 &&
      atelierState.portrait.subjects.every((subject) => EXAMPLE_FILENAMES.has(subject.photo.name))
    );
  } catch {
    return false;
  }
}

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
  const exampleButton = document.querySelector<HTMLButtonElement>("#use-example");

  if (
    !photoInput ||
    !uploadLabel ||
    !uploadTitle ||
    !uploadDescription ||
    !preview ||
    !previewImage ||
    !changeButton ||
    !list ||
    !feedback ||
    !assistance ||
    !exampleButton ||
    modeButtons.length !== 2
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
  let exampleLoadVersion = 0;
  let exampleFilesPromise: Promise<{ dog: File; cat: File }> | null = null;

  // The example prompt and button belong together in the existing markup.
  const exampleChoice = exampleButton.closest<HTMLElement>(".photo-alternative");
  if (!exampleChoice) {
    throw new Error("Example photograph choice container not found");
  }

  // Single-pet previews have a Change button but no Remove action.
  const removeSingleExample = document.createElement("button");
  removeSingleExample.type = "button";
  removeSingleExample.className = "pet-photo-remove";
  removeSingleExample.textContent = "Remove example pet";
  removeSingleExample.hidden = true;
  elements.changeButton.insertAdjacentElement("afterend", removeSingleExample);

  /** Keep example status separate from customer-uploaded photographs. */
  function setExampleMode(active: boolean): void {
    try {
      if (active) localStorage.setItem(EXAMPLE_STORAGE_KEY, "true");
      else localStorage.removeItem(EXAMPLE_STORAGE_KEY);
    } catch {
      // Optional browser storage; filenames still identify the example assets.
    }
  }

  // Photo credits are displayed only when the built-in photographs are used.
  const credits = document.createElement("p");
  credits.className = "example-photo-credits";
  credits.hidden = true;
  credits.append("Example photos: dog by ");
  const dogCredit = document.createElement("a");
  dogCredit.href = "https://unsplash.com/photos/a-small-dog-wearing-a-green-bandana-_hoAqzp39tk";
  dogCredit.textContent = "Karsten Winegeart";
  dogCredit.target = "_blank";
  dogCredit.rel = "noopener noreferrer";
  credits.append(dogCredit, " and cat by ");
  const catCredit = document.createElement("a");
  catCredit.href = "https://unsplash.com/photos/orange-and-white-tabby-cat-ng9yenZfeuI";
  catCredit.textContent = "Kabo";
  catCredit.target = "_blank";
  catCredit.rel = "noopener noreferrer";
  credits.append(catCredit, ", and scenery by ");
  const sceneryCredit = document.createElement("a");
  sceneryCredit.href = "https://unsplash.com/photos/field-of-green-trees--F5ik109zfU";
  sceneryCredit.textContent = "Madeleine Wilson";
  sceneryCredit.target = "_blank";
  sceneryCredit.rel = "noopener noreferrer";
  credits.append(sceneryCredit, " on Unsplash. For demonstration only.");
  // Keep attribution visible even while the Try an example choice is hidden.
  exampleChoice.insertAdjacentElement("afterend", credits);

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
    for (const badge of Array.from(
      document.querySelectorAll<HTMLElement>(".photo-preparation-badge")
    )) {
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
      uploadAreaMessage.textContent =
        activeCount === 1 ? "Preparing your photograph…" : `Preparing ${activeCount} photographs…`;
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
          (entry) => entry.id !== subject.id
        );
        synchroniseLegacyPhoto();
        if (atelierState.portrait.subjects.length === 0) setExampleMode(false);
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
    elements.uploadLabel.hidden =
      showSinglePreview || (mode === "several" && subjects.length >= MAX_PETS);

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
    const usingExamples = isUsingExamplePhotos();
    credits.hidden = !usingExamples;
    if (exampleChoice) exampleChoice.hidden = usingExamples;
    removeSingleExample.hidden = !usingExamples || !showSinglePreview;

    elements.uploadTitle.textContent =
      mode === "several"
        ? subjects.length
          ? "Add another pet"
          : "Choose your pets' photographs"
        : "Choose a photograph";
    elements.uploadDescription.textContent =
      mode === "several"
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
    ++exampleLoadVersion;
    // Uploading the customer's own photographs replaces example animals;
    // the two sources must never be mixed in an enquiry.
    if (isUsingExamplePhotos()) {
      atelierState.portrait.subjects = [];
      setExampleMode(false);
    }

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
    setExampleMode(false);
    synchroniseLegacyPhoto();
    persist();
    render();
    document.dispatchEvent(new Event("atelier:subjects-changed"));
    preloadPetCutouts();
    announce(
      atelierState.portrait.subjects.length === 1
        ? "Photograph added successfully."
        : `${atelierState.portrait.subjects.length} pet photographs added.`
    );
  }

  /**
   * Load a verified example image. Vite may return index.html with HTTP 200 when
   * a missing asset URL is requested, so checking response.ok is not enough.
   * Support both public/images/examples/ and public/images/ layouts.
   */
  async function loadExampleFile(filename: string, exampleName: string): Promise<File> {
    const base = import.meta.env.BASE_URL;
    const paths = [`${base}images/examples/${filename}`, `${base}images/${filename}`];

    for (const path of paths) {
      const response = await fetch(path);
      if (!response.ok) continue;

      const blob = await response.blob();
      const mimeType = blob.type.toLowerCase();
      if (!mimeType.startsWith("image/")) continue;

      // Verify the actual WebP file signature, not just its HTTP MIME type.
      const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      const signature = Array.from(header, (byte) => String.fromCharCode(byte)).join("");
      if (!signature.startsWith("RIFF") || signature.slice(8, 12) !== "WEBP") continue;

      // The file must also be decodable before we pass it to the cutout service.
      try {
        const bitmap = await createImageBitmap(blob);
        bitmap.close();
      } catch {
        continue;
      }

      // Stable metadata is essential: petCutoutCache uses lastModified in
      // its IndexedDB key. Date.now() would invalidate the cache on every visit.
      return new File([blob], exampleName, {
        type: "image/webp",
        lastModified: 0,
      });
    }

    throw new Error(`Could not find a valid example image: ${filename}`);
  }

  /** Download and validate the two examples once per page visit, in the background. */
  function preloadExampleFiles(): Promise<{ dog: File; cat: File }> {
    if (!exampleFilesPromise) {
      exampleFilesPromise = Promise.all([
        loadExampleFile("example-dog-desktop.webp", "atelier-example-dog.webp"),
        loadExampleFile("example-cat-desktop.webp", "atelier-example-cat.webp"),
      ])
        .then(([dog, cat]) => ({ dog, cat }))
        .catch((error: unknown) => {
          // A failed preload can be retried if someone chooses Try an example.
          exampleFilesPromise = null;
          throw error;
        });
    }
    return exampleFilesPromise;
  }

  /** Load ready-made pets through the same pipeline as customer photographs. */
  async function loadExamplePhotos(): Promise<void> {
    // Switching between guided and independent exploration must not create
    // new subjects or run background removal for examples already selected.
    const currentSubjects = atelierState.portrait.subjects;
    const requestedNames =
      mode === "several"
        ? ["atelier-example-dog.webp", "atelier-example-cat.webp"]
        : ["atelier-example-dog.webp"];
    const sameExamplesAlreadySelected =
      isUsingExamplePhotos() &&
      currentSubjects.length === requestedNames.length &&
      currentSubjects.every((subject, index) => subject.photo.name === requestedNames[index]);

    if (sameExamplesAlreadySelected) {
      announce("Your example pets are already selected. Continue exploring the Atelier.");
      render();
      return;
    }

    const existing = currentSubjects.length > 0;
    if (
      existing &&
      !isUsingExamplePhotos() &&
      !window.confirm(
        "Try example photographs?\n\nThis will replace the photographs you've uploaded with our example pets. You can upload your own photographs again whenever you like.\n\nChoose OK to use examples, or Cancel to keep your photographs."
      )
    ) {
      return;
    }

    const version = ++exampleLoadVersion;
    if (exampleButton) exampleButton.disabled = true;
    announce("Loading example photographs…");

    try {
      const { dog, cat } = await preloadExampleFiles();
      const files = mode === "several" ? [dog, cat] : [dog];
      if (version !== exampleLoadVersion) return;

      hasLocalEdits = true;
      atelierState.portrait.subjects = files.map((file) => createPortraitSubject(file));
      setExampleMode(true);
      synchroniseLegacyPhoto();
      persist();
      render();
      document.dispatchEvent(new Event("atelier:subjects-changed"));
      preloadPetCutouts();
      announce(
        files.length === 1
          ? "Example dog loaded. Explore the Atelier with this sample photograph."
          : "Example dog and cat loaded. Try arranging them together on a canvas."
      );
    } catch (error: unknown) {
      if (version === exampleLoadVersion) {
        const detail = error instanceof Error ? error.message : "An unknown error occurred.";
        announce(
          `${detail} Check that the WebP files are in public/images/examples/ (or public/images/). Your existing photographs have not been changed.`
        );
      }
    } finally {
      if (version === exampleLoadVersion && exampleButton) exampleButton.disabled = false;
    }
  }

  exampleButton.addEventListener("click", () => {
    void loadExamplePhotos();
  });

  removeSingleExample.addEventListener("click", () => {
    if (!isUsingExamplePhotos() || atelierState.portrait.subjects.length !== 1) return;
    ++exampleLoadVersion;
    hasLocalEdits = true;
    atelierState.portrait.subjects = [];
    setExampleMode(false);
    synchroniseLegacyPhoto();
    persist();
    render();
    document.dispatchEvent(new Event("atelier:subjects-changed"));
    announce("Example photograph removed.");
  });

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

      // Expanding a one-pet example to several pets should add the cat,
      // not download or reprocess the dog a second time.
      if (
        requested === "several" &&
        isUsingExamplePhotos() &&
        atelierState.portrait.subjects.length === 1 &&
        atelierState.portrait.subjects[0].photo.name === "atelier-example-dog.webp"
      ) {
        const version = ++exampleLoadVersion;
        void (async () => {
          try {
            const { cat } = await preloadExampleFiles();
            if (
              version !== exampleLoadVersion ||
              mode !== "several" ||
              !isUsingExamplePhotos() ||
              atelierState.portrait.subjects.length !== 1
            )
              return;

            hasLocalEdits = true;
            atelierState.portrait.subjects.push(createPortraitSubject(cat));
            synchroniseLegacyPhoto();
            persist();
            render();
            document.dispatchEvent(new Event("atelier:subjects-changed"));
            preloadPetCutouts();
            announce("Example dog and cat ready. Try arranging them together.");
          } catch (error: unknown) {
            const detail =
              error instanceof Error ? error.message : "Could not load the example cat.";
            announce(detail);
          }
        })();
      }
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
        const legacy = atelierState.portrait.photo ?? (await loadPhoto());
        if (hasLocalEdits) return;
        if (legacy) {
          atelierState.portrait.subjects = [createPortraitSubject(legacy)];
          persist();
        }
      }
      synchroniseLegacyPhoto();
      if (!isUsingExamplePhotos()) setExampleMode(false);
      render();
      document.dispatchEvent(new Event("atelier:subjects-changed"));
      preloadPetCutouts();
    } catch {
      announce("We couldn't restore previous photographs. You can choose them again.");
    }
  })();

  render();
  // Warm the same persistent cutout cache used for customer photographs.
  // Start after initial UI rendering, one example at a time. If a visitor
  // chooses an example during preparation, getPetCutoutBlob shares the
  // in-flight promise rather than running background removal twice.
  async function warmExampleCutouts(): Promise<void> {
    const { dog, cat } = await preloadExampleFiles();
    for (const file of [dog, cat]) {
      try {
        await getPetCutoutBlob(file);
      } catch {
        // Warming is optional. The normal preview flow will retry and
        // display its existing error status if processing still fails.
      }
    }
  }

  // Let the welcome screen render before using the device for AI processing.
  // On subsequent visits, IndexedDB serves prepared example cutouts directly.
  window.setTimeout(() => {
    void warmExampleCutouts().catch(() => {
      // Missing example assets are reported by the Try an example action.
    });
  }, 1200);
}
