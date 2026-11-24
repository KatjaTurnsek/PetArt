import { atelierState } from "../app/atelierState";
import { isUsingExamplePhotos } from "./photoUpload";

const MAX_BACKGROUND_SIZE = 15 * 1024 * 1024;
const ALLOWED_BACKGROUND_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Step 7 enquiry: collect customer details for the future API.
 * Does not upload or send anything until the secure API is implemented.
 */
export function initEnquiryForm(): void {
  const form = document.querySelector<HTMLFormElement>("#atelier-enquiry-form");
  const name = document.querySelector<HTMLInputElement>("#enquiry-name");
  const email = document.querySelector<HTMLInputElement>("#enquiry-email");
  const message = document.querySelector<HTMLTextAreaElement>("#enquiry-message");
  const backgroundInput = document.querySelector<HTMLInputElement>("#enquiry-background-file");
  const backgroundSection = document.querySelector<HTMLElement>("#enquiry-extra-background");
  const backgroundFeedback = document.querySelector<HTMLElement>("#enquiry-background-feedback");
  const fileRow = document.querySelector<HTMLElement>("#enquiry-file-row");
  const filename = document.querySelector<HTMLElement>("#enquiry-file-name");
  const removeBackground = document.querySelector<HTMLButtonElement>("#enquiry-remove-background");
  const exampleNote = document.querySelector<HTMLElement>("#enquiry-example-note");
  const submit = document.querySelector<HTMLButtonElement>("#summary-enquiry");
  const status = document.querySelector<HTMLElement>("#enquiry-form-status");

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

  // Capture validated elements so nested callbacks retain non-null types.
  const view = { fileRow, filename, backgroundSection, exampleNote };

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
    // An example visit may change back to real photos without losing a previously selected reference.
    // It must not be included in an example enquiry when submission is implemented.
    updateFileView();
  }

  backgroundInput.addEventListener("change", () => {
    backgroundFeedback.textContent = "";
    const file = backgroundInput.files?.[0];
    if (!file) return;

    if (!ALLOWED_BACKGROUND_TYPES.has(file.type)) {
      backgroundFeedback.textContent = "Please choose a JPG, PNG or WebP photograph.";
      backgroundInput.value = "";
      return;
    }
    if (file.size > MAX_BACKGROUND_SIZE) {
      backgroundFeedback.textContent = "Please choose a photograph smaller than 15 MB.";
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
    // Defense in depth: never imply that an enquiry was sent without a backend response.
    status.textContent =
      "The secure enquiry service isn't connected yet. Your details have not been sent.";
  });

  // The API and privacy-policy integration are the next milestone.
  submit.disabled = true;
  document.addEventListener("atelier:summary-screen-opened", syncExampleMode);
  syncExampleMode();
}
