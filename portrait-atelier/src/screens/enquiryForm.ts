
import { atelierState } from "../app/atelierState";
import {
  createEnquiryPayload,
  submitEnquiry,
  type EnquiryResponse,
} from "../app/enquiryApi";
import { uploadReference } from "../app/referenceUploadApi";
import {
  collectEnquiryReferences,
  type EnquiryReference,
} from "../app/collectEnquiryReferences";
import { isUsingExamplePhotos } from "./photoUpload";

const MAX_BACKGROUND_SIZE = 15 * 1024 * 1024;
const MAX_REFERENCES = 20;

const ALLOWED_BACKGROUND_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Generates a cryptographically secure upload token.
 * The same token is reused for retries during this page visit.
 */
function createUploadToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  const binary = Array.from(bytes, (byte) =>
    String.fromCharCode(byte)
  ).join("");

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Step 7 — Submit an enquiry and its reference photographs.
 *
 * Keeps the enquiry credentials in memory for upload retries.
 * Never reports full success until all files are uploaded.
 */
export function initEnquiryForm(): void {
  const form = document.querySelector<HTMLFormElement>(
    "#atelier-enquiry-form",
  );
  const name = document.querySelector<HTMLInputElement>("#enquiry-name");
  const email = document.querySelector<HTMLInputElement>("#enquiry-email");
  const message = document.querySelector<HTMLTextAreaElement>(
    "#enquiry-message",
  );
  const backgroundInput = document.querySelector<HTMLInputElement>(
    "#enquiry-background-file",
  );
  const backgroundSection = document.querySelector<HTMLElement>(
    "#enquiry-extra-background",
  );
  const backgroundFeedback = document.querySelector<HTMLElement>(
    "#enquiry-background-feedback",
  );
  const fileRow = document.querySelector<HTMLElement>("#enquiry-file-row");
  const filename = document.querySelector<HTMLElement>(
    "#enquiry-file-name",
  );
  const removeBackground = document.querySelector<HTMLButtonElement>(
    "#enquiry-remove-background",
  );
  const exampleNote = document.querySelector<HTMLElement>(
    "#enquiry-example-note",
  );
  const submit = document.querySelector<HTMLButtonElement>(
    "#summary-enquiry",
  );
  const status = document.querySelector<HTMLElement>(
    "#enquiry-form-status",
  );

  if (
    !form ||
    !name ||
    !email ||
    !message ||
    !backgroundInput ||
    !backgroundSection ||
    !backgroundFeedback ||
    !fileRow ||
    !filename ||
    !removeBackground ||
    !exampleNote ||
    !submit ||
    !status
  ) {
    throw new Error("Enquiry form elements not found.");
  }

  const view = {
    fileRow,
    filename,
    backgroundSection,
    exampleNote,
  };

  // Generate credentials once per page visit.
  // Retries reuse these values rather than creating a new enquiry.
  const submissionKey = crypto.randomUUID();
  const uploadToken = createUploadToken();

  let savedEnquiry: EnquiryResponse | null = null;
  let pendingReferences: (EnquiryReference & { uploadId: string })[] = [];
  let nextReferenceIndex = 0;
  let isSubmitting = false;
  let isComplete = false;

  name.value = atelierState.enquiry.name;
  email.value = atelierState.enquiry.email;
  message.value = atelierState.enquiry.message;

  name.addEventListener("input", () => {
    atelierState.enquiry.name = name.value;
  });

  email.addEventListener("input", () => {
    atelierState.enquiry.email = email.value;
  });

  message.addEventListener("input", () => {
    atelierState.enquiry.message = message.value;
  });

  function updateFileView(): void {
    const file = atelierState.enquiry.additionalBackground;

    view.fileRow.hidden = file === null;
    view.filename.textContent = file?.name ?? "";
  }

  function syncExampleMode(): void {
    const usingExamples = isUsingExamplePhotos();

    view.backgroundSection.hidden = usingExamples;
    view.exampleNote.hidden = !usingExamples;

    updateFileView();
  }

  backgroundInput.addEventListener("change", () => {
    backgroundFeedback.textContent = "";

    const file = backgroundInput.files?.[0];
    if (!file) return;

    if (!ALLOWED_BACKGROUND_TYPES.has(file.type)) {
      backgroundFeedback.textContent =
        "Please choose a JPG, PNG or WebP photograph.";
      backgroundInput.value = "";
      return;
    }

    if (file.size === 0 || file.size > MAX_BACKGROUND_SIZE) {
      backgroundFeedback.textContent =
        "Please choose a photograph smaller than 15 MB.";
      backgroundInput.value = "";
      return;
    }

    atelierState.enquiry.additionalBackground = file;
    updateFileView();
  });

  removeBackground.addEventListener("click", () => {
    atelierState.enquiry.additionalBackground = null;
    backgroundInput.value = "";
    backgroundFeedback.textContent = "";
    updateFileView();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (isSubmitting || isComplete) return;

    if (!form.reportValidity()) return;

    if (isUsingExamplePhotos()) {
      status.textContent =
        "Please choose your own pet photographs before sending an enquiry.";
      return;
    }

    if (atelierState.portrait.subjects.length === 0) {
      status.textContent =
        "Please add at least one pet photograph before submitting.";
      return;
    }

    if (!savedEnquiry) {
      const references = collectEnquiryReferences(atelierState);

      if (references.length > MAX_REFERENCES) {
        status.textContent =
          "Please select no more than 20 reference photographs.";
        return;
      }

      pendingReferences = references.map((reference) => ({
        ...reference,
        uploadId: crypto.randomUUID(),
      }));
      nextReferenceIndex = 0;
    }

    void sendEnquiry();
  });

  async function sendEnquiry(): Promise<void> {
    if (isSubmitting || isComplete) return;

    isSubmitting = true;
    submit.disabled = true;

    try {
      if (!savedEnquiry) {
        status.textContent = "Saving your enquiry…";

        savedEnquiry = await submitEnquiry(
          createEnquiryPayload(
            atelierState,
            submissionKey,
            uploadToken,
          ),
        );
      }

      while (nextReferenceIndex < pendingReferences.length) {
        const reference = pendingReferences[nextReferenceIndex];

        status.textContent =
          `Uploading photograph ${nextReferenceIndex + 1} ` +
          `of ${pendingReferences.length}…`;

          await uploadReference(
            reference.file,
            reference.type,
            savedEnquiry,
            reference.uploadId,
          );

        nextReferenceIndex += 1;
      }

      isComplete = true;
      status.textContent =
        "Your enquiry and photographs have been saved successfully.";
      submit.textContent = "Enquiry submitted";
    } catch (error: unknown) {
      const detail = error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.";

      status.textContent = savedEnquiry
        ? `${detail} Your enquiry was saved. ` +
          "You can retry uploading the remaining photographs."
        : detail;
    } finally {
      isSubmitting = false;
      submit.disabled = isComplete;
    }
  }

  // Enabled for local development only.
  // Production launch requires privacy and security review.
  submit.disabled = false;

  document.addEventListener(
    "atelier:summary-screen-opened",
    syncExampleMode,
  );

  syncExampleMode();
}
