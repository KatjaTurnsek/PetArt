import { atelierState } from "../app/atelierState";
import { drawPictureFrame, type FrameStyle } from "../app/frameRendererV2";
import { getFramePreviewThickness } from "../app/frameDefinitions";

type Point = { x: number; y: number };
type RoomId = "warm" | "classic" | "modern" | "dark" | "upload";
type RoomSaved = { room: RoomId; x: number; y: number; width: number; perspective: boolean; offsets: Point[] };
const ROOM_PRESETS: Record<Exclude<RoomId, "upload">, { url: string; alt: string }> = {
  warm: { url: "/rooms/warm-living-room.webp", alt: "Warm living room" },
  classic: { url: "/rooms/classic-interior.webp", alt: "Classic interior" },
  modern: { url: "/rooms/modern-interior.webp", alt: "Modern interior" },
  dark: { url: "/rooms/dark-study.webp", alt: "Dark study" },
};
const STORAGE_KEY = "portrait-atelier-room-settings-v1";
// Tracks which canvas dimensions the current room estimate was based on.
// Kept separate from existing room settings to preserve older saved placements.
const SCALE_SIGNATURE_KEY = "portrait-atelier-room-scale-signature-v1";
// Approximate width represented by each example photograph at the painting wall.
// These are illustrative assumptions, NOT measurements of the photographed rooms.
const ROOM_ESTIMATED_VIEW_WIDTH_CM: Record<Exclude<RoomId, "upload">, number> = {
  warm: 340,
  classic: 395,
  modern: 350,
  dark: 310,
};
const MIN_ROOM_PREVIEW_FRACTION = 0.05;
const MAX_ROOM_PREVIEW_FRACTION = 0.7;

function currentCanvasSignature(room: RoomId): string | null {
  const { width, height } = atelierState.canvas;
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  return `${room}:${width}:${height}`;
}

/** Estimate painting width relative to the visible room photograph. */
function estimatedPreviewWidth(room: Exclude<RoomId, "upload">): number | null {
  const canvasWidthCm = atelierState.canvas.width;
  if (!canvasWidthCm || !Number.isFinite(canvasWidthCm) || canvasWidthCm <= 0) return null;
  return Math.max(MIN_ROOM_PREVIEW_FRACTION, Math.min(MAX_ROOM_PREVIEW_FRACTION,
    canvasWidthCm / ROOM_ESTIMATED_VIEW_WIDTH_CM[room]));
}
const ROOM_DATABASE = "portrait-atelier-room-v1";
const ROOM_KEY = "room-photo";
const DEFAULT_OFFSETS = (): Point[] => [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
const DEFAULT_ROOM: RoomSaved = { room: "warm", x: 0.5, y: 0.37, width: 0.32, perspective: false, offsets: DEFAULT_OFFSETS() };

function roomDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ROOM_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("assets");
    request.onerror = () => reject(request.error ?? new Error("Room storage could not be opened."));
    request.onsuccess = () => resolve(request.result);
  });
}
async function readRoomFile(): Promise<Blob | null> {
  const db = await roomDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("assets", "readonly").objectStore("assets").get(ROOM_KEY);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function writeRoomFile(file: Blob | null): Promise<void> {
  const db = await roomDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("assets", "readwrite");
      if (file) transaction.objectStore("assets").put(file, ROOM_KEY);
      else transaction.objectStore("assets").delete(ROOM_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

/** Solve the 8 coefficients of a source-to-quad homography, no external dependency. */
function homography(width: number, height: number, quad: Point[]): string {
  const from: Point[] = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const rows: number[][] = [];
  from.forEach((p, i) => {
    const q = quad[i];
    rows.push([p.x, p.y, 1, 0, 0, 0, -p.x * q.x, -p.y * q.x, q.x]);
    rows.push([0, 0, 0, p.x, p.y, 1, -p.x * q.y, -p.y * q.y, q.y]);
  });
  for (let i = 0; i < 8; i++) {
    let pivot = i;
    for (let j = i + 1; j < 8; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
    if (Math.abs(rows[pivot][i]) < 1e-9) return "none";
    [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
    const divisor = rows[i][i];
    for (let k = i; k < 9; k++) rows[i][k] /= divisor;
    for (let j = 0; j < 8; j++) {
      if (i === j) continue;
      const factor = rows[j][i];
      for (let k = i; k < 9; k++) rows[j][k] -= factor * rows[i][k];
    }
  }
  const [a, b, c, d, e, f, g, h] = rows.map((row) => row[8]);
  // CSS matrices are column-major, with the projective denominator in row 4.
  return `matrix3d(${[a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, 1].join(",")})`;
}

function getAspectRatio(): number {
  const { width, height, shape } = atelierState.canvas;
  if (width && height) return width / height;
  return shape === "landscape" ? 1.25 : shape === "square" ? 1 : 0.8;
}

/** Stage 6 — built-in interiors, uploaded room, draggable portrait, perspective. */
export function initRoomVisualiser(): void {
  const view = document.querySelector<HTMLElement>("#room-preview");
  const background = document.querySelector<HTMLImageElement>("#room-background");
  const placed = document.querySelector<HTMLElement>("#room-placed-portrait");
  const handles = document.querySelector<HTMLElement>("#room-corner-handles");
  const feedback = document.querySelector<HTMLElement>("#room-feedback");
  const sizeInput = document.querySelector<HTMLInputElement>("#room-portrait-size");
  const sizeValue = document.querySelector<HTMLOutputElement>("#room-size-value");
  const photoInput = document.querySelector<HTMLInputElement>("#room-photo");
  const removePhoto = document.querySelector<HTMLButtonElement>("#room-remove-photo");
  const reset = document.querySelector<HTMLButtonElement>("#room-reset");
  const perspectiveButton = document.querySelector<HTMLButtonElement>("#room-perspective");
  const perspectiveHelp = document.querySelector<HTMLElement>("#room-perspective-help");
  const roomButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-room-preset]"));
  if (!view || !background || !placed || !handles || !feedback || !sizeInput || !sizeValue || !photoInput || !removePhoto || !reset || !perspectiveButton || !perspectiveHelp || roomButtons.length !== 4) {
    throw new Error("Room visualiser elements not found.");
  }
  const ui = { view, background, placed, handles, feedback, sizeInput, sizeValue, photoInput, removePhoto, reset, perspectiveButton, perspectiveHelp };
  // The previous 14% minimum exaggerated small (e.g. 30 cm) paintings.
  // This slider changes apparent size only; it never changes atelierState.canvas.
  // The slider represents a multiple of the room's estimated starting size,
  // NOT a percentage of the room image width.
  ui.sizeInput.step = "5";
  // Add a fifth choice without touching index.html or the four example-room buttons.
  const choices = roomButtons[0].parentElement;
  if (!choices) throw new Error("Room choices container not found.");
  const myRoomButton = document.createElement("button");
  myRoomButton.type = "button";
  myRoomButton.className = "room-choice";
  myRoomButton.setAttribute("aria-pressed", "false");
  myRoomButton.hidden = true;
  const myRoomImage = document.createElement("img");
  myRoomImage.alt = "";
  const myRoomLabel = document.createElement("span");
  myRoomLabel.textContent = "My room";
  myRoomButton.append(myRoomImage, myRoomLabel);
  choices.append(myRoomButton);
  // The existing button explicitly deletes the stored room; clarify that action.
  ui.removePhoto.textContent = "Remove my room";
  let settings: RoomSaved = { ...DEFAULT_ROOM, offsets: DEFAULT_OFFSETS() };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<RoomSaved> | null;
    if (stored && typeof stored.x === "number" && typeof stored.width === "number" && typeof stored.y === "number" &&
      ["warm", "classic", "modern", "dark", "upload"].includes(String(stored.room))) {
      settings = {
        room: stored.room as RoomId,
        x: Math.max(0.1, Math.min(0.9, stored.x)),
        y: Math.max(0.1, Math.min(0.9, stored.y)),
        width: Math.max(MIN_ROOM_PREVIEW_FRACTION, Math.min(MAX_ROOM_PREVIEW_FRACTION, stored.width)),
        perspective: Boolean(stored.perspective),
        offsets: Array.isArray(stored.offsets) && stored.offsets.length === 4 && stored.offsets.every((point) =>
          typeof point?.x === "number" && Number.isFinite(point.x) && typeof point?.y === "number" && Number.isFinite(point.y))
          ? stored.offsets.map((point) => ({ x: Math.max(-0.35, Math.min(0.35, point.x)), y: Math.max(-0.35, Math.min(0.35, point.y)) }))
          : DEFAULT_OFFSETS(),
      };
    }
  } catch { /* Empty or invalid stored choices use defaults. */ }
  let roomPhotoUrl: string | null = null;
  let uploadVersion = 0;
  let activePointer: { pointerId: number; x: number; y: number; initialX: number; initialY: number; corner?: number } | null = null;
  let visualVersion = 0;
  let hasPortrait = false;

  function save(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage is optional. */ }
    atelierState.room.positionX = settings.x;
    atelierState.room.positionY = settings.y;
    atelierState.room.scale = settings.width;
  }
  function recordScaleSignature(): void {
    const signature = currentCanvasSignature(settings.room);
    if (!signature) return;
    try { localStorage.setItem(SCALE_SIGNATURE_KEY, signature); } catch { /* Optional storage. */ }
  }
  function applyEstimatedScale(force = false): void {
    if (settings.room === "upload") return; // An unmeasured user photo stays manually adjustable.
    const signature = currentCanvasSignature(settings.room);
    if (!signature) return;
    if (!force) {
      try { if (localStorage.getItem(SCALE_SIGNATURE_KEY) === signature) return; }
      catch { /* The estimate still works if storage is unavailable. */ }
    }
    const estimated = estimatedPreviewWidth(settings.room);
    if (estimated === null) return;
    settings.width = estimated;
    // Changing actual canvas size should not preserve a previous size's perspective warp.
    // However, we leave the customer's corner adjustments and position untouched.
    recordScaleSignature();
    save();
  }
  function previewBaseWidth(): number {
    // Personal rooms have no known physical reference, so 100% represents
    // their starting visual scale only, not actual physical dimensions.
    return settings.room === "upload"
      ? 0.32
      : (estimatedPreviewWidth(settings.room) ?? 0.32);
  }
  function updatePreviewScaleLabel(): void {
    const base = previewBaseWidth();
    const min = Math.max(10, Math.ceil(MIN_ROOM_PREVIEW_FRACTION / base * 20) * 5);
    const max = Math.max(100, Math.min(400, Math.floor(MAX_ROOM_PREVIEW_FRACTION / base * 20) * 5));
    ui.sizeInput.min = String(min);
    ui.sizeInput.max = String(max);
    const percentage = Math.max(min, Math.min(max, Math.round(settings.width / base * 100 / 5) * 5));
    ui.sizeInput.value = String(percentage);
    ui.sizeValue.textContent = `${Math.round(settings.width / base * 100)}%`;
    const label = ui.sizeInput.previousElementSibling;
    const labelText = label?.firstChild;
    if (labelText?.nodeType === Node.TEXT_NODE) {
      labelText.textContent = settings.room === "upload"
        ? "Preview scale (visual only) "
        : "Preview scale (estimate: 100%) ";
    }
  }
  function roomUrl(): { url: string; alt: string } {
    if (settings.room === "upload" && roomPhotoUrl) return { url: roomPhotoUrl, alt: "Your uploaded room" };
    return ROOM_PRESETS[settings.room === "upload" ? "warm" : settings.room];
  }
  function updateRoom(): void {
    const data = roomUrl();
    if (ui.background.src !== new URL(data.url, document.baseURI).href) ui.background.src = data.url;
    ui.background.alt = data.alt;
    roomButtons.forEach((button) => {
      const active = button.dataset.roomPreset === settings.room;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
    myRoomButton.hidden = !roomPhotoUrl;
    myRoomButton.classList.toggle("is-selected", settings.room === "upload");
    myRoomButton.setAttribute("aria-pressed", String(settings.room === "upload"));
    ui.removePhoto.hidden = !roomPhotoUrl;
    updatePreviewScaleLabel();
    ui.perspectiveButton.setAttribute("aria-pressed", String(settings.perspective));
    ui.perspectiveButton.textContent = settings.perspective ? "Done" : "Adjust perspective";
    ui.perspectiveHelp.hidden = !settings.perspective;
    ui.handles.hidden = !settings.perspective || !hasPortrait;
  }
  function quad(): Point[] {
    const w = ui.view.clientWidth;
    const h = ui.view.clientHeight;
    const pw = settings.width * w;
    const ph = pw / getAspectRatio();
    const x = settings.x * w;
    const y = settings.y * h;
    const points = [
      { x: x - pw / 2, y: y - ph / 2 },
      { x: x + pw / 2, y: y - ph / 2 },
      { x: x + pw / 2, y: y + ph / 2 },
      { x: x - pw / 2, y: y + ph / 2 },
    ];
    return points.map((p, i) => ({ x: p.x + settings.offsets[i].x * pw, y: p.y + settings.offsets[i].y * ph }));
  }
  function updatePlacement(): void {
    if (!hasPortrait) return;
    const corners = quad();
    const sourceWidth = Number(ui.placed.dataset.originalWidth) || 420;
    const sourceHeight = Number(ui.placed.dataset.originalHeight) || sourceWidth / getAspectRatio();
    ui.placed.style.transform = homography(sourceWidth, sourceHeight, corners);
    Array.from(ui.handles.children).forEach((node, i) => {
      const handle = node as HTMLElement;
      handle.style.left = `${corners[i].x}px`;
      handle.style.top = `${corners[i].y}px`;
    });
  }

  /** Temporarily give Step 4 layout dimensions; no visible flash is painted. */
  function snapshotBackground(): HTMLElement | null {
    const screen = document.querySelector<HTMLElement>("#background-screen");
    const source = document.querySelector<HTMLElement>("#background-live-preview");
    if (!screen || !source) return null;
    const wasHidden = screen.hidden;
    const formerStyle = screen.getAttribute("style");
    const previousWidth = source.style.width;
    screen.hidden = false;
    screen.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;visibility:hidden;pointer-events:none;";
    source.style.width = "420px";
    // This paints the latest multi-pet composition at a stable size.
    document.dispatchEvent(new Event("atelier:background-screen-opened"));
    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.querySelectorAll<HTMLElement>("[id]").forEach((node) => node.removeAttribute("id"));
    clone.classList.remove("is-background-draggable");
    clone.style.width = "420px";
    clone.style.margin = "0";
    clone.style.maxWidth = "none";
    clone.style.borderRadius = "0";
    source.style.width = previousWidth;
    if (formerStyle === null) screen.removeAttribute("style"); else screen.setAttribute("style", formerStyle);
    screen.hidden = wasHidden;
    return clone;
  }
  async function refreshPortrait(): Promise<void> {
    const version = ++visualVersion;
    const hasPet = atelierState.portrait.subjects.length > 0 || atelierState.portrait.photo !== null;
    if (!hasPet) {
      hasPortrait = false;
      ui.placed.replaceChildren();
      ui.handles.hidden = true;
      ui.feedback.textContent = "Choose your pet photograph first to see it in a room.";
      return;
    }
    const snapshot = snapshotBackground();
    if (!snapshot) return;
    const sourceWidth = 420;
    const sourceHeight = 420 / getAspectRatio();
    ui.placed.replaceChildren();
    const artwork = document.createElement("div");
    artwork.className = "room-artwork";
    artwork.append(snapshot);
    ui.placed.style.width = `${sourceWidth}px`;
    ui.placed.style.height = `${sourceHeight}px`;
    ui.placed.dataset.originalWidth = String(sourceWidth);
    ui.placed.dataset.originalHeight = String(sourceHeight);
    ui.placed.append(artwork);
    hasPortrait = true;
    updateRoom();
    updatePlacement();
    const style = (atelierState.framing.selectedFrame ?? "none") as FrameStyle;
    if (!["none", "rustic", "antique-gold", "natural-wood"].includes(style) || style === "none") return;
    const t = getFramePreviewThickness(style, sourceWidth);
    const frameCanvas = document.createElement("canvas");
    try {
      await drawPictureFrame(frameCanvas, style, sourceWidth + t * 2, sourceHeight + t * 2, t);
      if (version !== visualVersion) return;
      const image = document.createElement("img");
      image.className = "room-frame-image";
      image.alt = "";
      image.src = frameCanvas.toDataURL("image/png");
      image.style.left = `${-t}px`;
      image.style.top = `${-t}px`;
      image.style.width = `${sourceWidth + t * 2}px`;
      image.style.height = `${sourceHeight + t * 2}px`;
      artwork.append(image);
    } catch {
      if (version === visualVersion) ui.feedback.textContent = "The painting is visible, but the decorative frame couldn't load.";
    }
  }
  function resetPlacement(): void {
    settings.x = 0.5;
    settings.y = 0.37;
    settings.width = 0.32;
    settings.offsets = DEFAULT_OFFSETS();
    applyEstimatedScale(true);
    save();
    updateRoom();
    updatePlacement();
  }

  for (const button of roomButtons) {
    button.addEventListener("click", () => {
      const choice = button.dataset.roomPreset;
      if (choice !== "warm" && choice !== "classic" && choice !== "modern" && choice !== "dark") return;
      settings.room = choice;
      applyEstimatedScale(true);
      save(); updateRoom(); updatePlacement();
    });
  }
  myRoomButton.addEventListener("click", () => {
    if (!roomPhotoUrl) return;
    settings.room = "upload";
    save(); updateRoom();
  });
  ui.photoInput.addEventListener("change", () => {
    const file = ui.photoInput.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) {
      ui.feedback.textContent = "Choose a JPG, PNG or WebP image smaller than 15 MB.";
      ui.photoInput.value = "";
      return;
    }
    const previous = roomPhotoUrl;
    roomPhotoUrl = URL.createObjectURL(file);
    myRoomImage.src = roomPhotoUrl;
    if (previous) URL.revokeObjectURL(previous);
    const version = ++uploadVersion;
    settings.room = "upload";
    atelierState.room.image = file;
    save(); updateRoom();
    ui.feedback.textContent = "Room photo added. Drag your portrait to position it.";
    void writeRoomFile(file).catch(() => {
      if (uploadVersion === version) ui.feedback.textContent = "Room photo is shown, but couldn't be saved for refresh.";
    });
  });
  ui.removePhoto.addEventListener("click", () => {
    ++uploadVersion;
    settings.room = "warm";
    atelierState.room.image = null;
    save(); updateRoom();
    ui.photoInput.value = "";
    void writeRoomFile(null).catch(() => { ui.feedback.textContent = "Couldn't clear the saved room photo."; });
    if (roomPhotoUrl) URL.revokeObjectURL(roomPhotoUrl);
    roomPhotoUrl = null;
    myRoomImage.removeAttribute("src");
    updateRoom();
  });
  ui.sizeInput.addEventListener("input", () => {
    settings.width = Math.max(MIN_ROOM_PREVIEW_FRACTION, Math.min(MAX_ROOM_PREVIEW_FRACTION,
      previewBaseWidth() * Number(ui.sizeInput.value) / 100));
    recordScaleSignature(); // Preserve deliberate manual adjustment.
    save();
    updatePreviewScaleLabel();
    updatePlacement();
  });
  ui.reset.addEventListener("click", resetPlacement);
  ui.perspectiveButton.addEventListener("click", () => {
    settings.perspective = !settings.perspective;
    save(); updateRoom(); updatePlacement();
  });

  for (let i = 0; i < 4; i++) {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "room-corner-handle";
    handle.setAttribute("aria-label", `Adjust corner ${i + 1}`);
    handle.dataset.corner = String(i);
    ui.handles.append(handle);
  }
  function startDrag(event: PointerEvent, corner?: number): void {
    if (!hasPortrait) return;
    event.preventDefault();
    activePointer = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, initialX: corner === undefined ? settings.x : settings.offsets[corner].x, initialY: corner === undefined ? settings.y : settings.offsets[corner].y, corner };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  ui.placed.addEventListener("pointerdown", (event) => startDrag(event));
  ui.handles.addEventListener("pointerdown", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-corner]");
    if (target) startDrag(event, Number(target.dataset.corner));
  });
  function move(event: PointerEvent): void {
    if (!activePointer || activePointer.pointerId !== event.pointerId) return;
    const diffX = event.clientX - activePointer.x;
    const diffY = event.clientY - activePointer.y;
    if (activePointer.corner === undefined) {
      settings.x = Math.max(0.05, Math.min(0.95, activePointer.initialX + diffX / Math.max(1, ui.view.clientWidth)));
      settings.y = Math.max(0.05, Math.min(0.95, activePointer.initialY + diffY / Math.max(1, ui.view.clientHeight)));
    } else {
      const scaleWidth = Math.max(1, settings.width * ui.view.clientWidth);
      const scaleHeight = scaleWidth / getAspectRatio();
      settings.offsets[activePointer.corner].x = Math.max(-0.35, Math.min(0.35, activePointer.initialX + diffX / scaleWidth));
      settings.offsets[activePointer.corner].y = Math.max(-0.35, Math.min(0.35, activePointer.initialY + diffY / scaleHeight));
    }
    updatePlacement();
  }
  ui.placed.addEventListener("pointermove", move);
  ui.handles.addEventListener("pointermove", move);
  function finish(event: PointerEvent): void {
    if (activePointer?.pointerId !== event.pointerId) return;
    activePointer = null;
    save();
  }
  ui.placed.addEventListener("pointerup", finish);
  ui.placed.addEventListener("pointercancel", finish);
  ui.handles.addEventListener("pointerup", finish);
  ui.handles.addEventListener("pointercancel", finish);

  const observer = new ResizeObserver(updatePlacement);
  observer.observe(ui.view);
  // Canvas dimensions are changed in Step 3, before the customer returns here.
  // Recompute the estimate for the already-selected example room immediately;
  // selecting another room must never be necessary to refresh the scale.
  // Always compare the dimensions used for the last room placement with the
  // CURRENT canvas dimensions. Do not update that signature while Step 3 is open.
  function syncCanvasDimensions(): void {
    if (atelierState.currentStep !== 6) return;
    const signature = currentCanvasSignature(settings.room);
    if (!signature) return;
    let previousSignature: string | null = null;
    try { previousSignature = localStorage.getItem(SCALE_SIGNATURE_KEY); }
    catch { /* If storage is blocked, use a new visual baseline. */ }
    if (signature === previousSignature) return;

    // A different canvas selection starts at 100% of its new preview baseline.
    // Uploaded rooms cannot be physically calibrated, so 100% is visual only.
    if (settings.room === "upload") {
      settings.width = 0.32;
    } else {
      const estimate = estimatedPreviewWidth(settings.room);
      if (estimate === null) return;
      settings.width = estimate;
    }
    recordScaleSignature();
    save();
    updateRoom();
    updatePlacement();
  }
  document.addEventListener("atelier:size-changed", syncCanvasDimensions);
  document.addEventListener("atelier:room-screen-opened", () => {
    syncCanvasDimensions();
    updateRoom();
    updatePlacement();
    void refreshPortrait();
  });
  // Keep the frame in the room preview in sync with Step 5, without changing placement.
  document.addEventListener("atelier:frame-changed", () => {
    if (atelierState.currentStep === 6) void refreshPortrait();
  });
  document.addEventListener("atelier:room-portrait-changed", () => { if (atelierState.currentStep === 6) void refreshPortrait(); });
  document.addEventListener("atelier:cutout-ready", () => { if (atelierState.currentStep === 6) void refreshPortrait(); });

  // Restore the uploaded room even when an example room was last selected.
  // The version check prevents a delayed read from undoing a new upload/removal.
  const restoreVersion = uploadVersion;
  void readRoomFile().then((saved) => {
    if (!saved || roomPhotoUrl || uploadVersion !== restoreVersion) return;
    roomPhotoUrl = URL.createObjectURL(saved);
    myRoomImage.src = roomPhotoUrl;
    atelierState.room.image = new File([saved], "room-photo", { type: saved.type });
    updateRoom();
  }).catch(() => {
    if (settings.room === "upload" && !roomPhotoUrl) {
      settings.room = "warm";
      save(); updateRoom();
    }
  });
  applyEstimatedScale();
  updateRoom();
}
