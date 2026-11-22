import Konva from "konva";
import { atelierState } from "../app/atelierState";
import type { PortraitSubject } from "../app/atelierState";
import { savePortraitSubjects } from "../app/photoStorage";
import { preparePetCutout } from "../app/multiPetPreview";
import { drawGroundShadow, getGroundShadowSprite, groundShadowBounds, hasGroundShadow, setGroundShadow } from "../app/groundShadow";

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
const BASE_HEIGHT = 0.56;

type ExtractedImage = { file: File; image: HTMLCanvasElement };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Adds the multi-pet editor only when several photographs are present. */
export function initMultiPetComposition(): void {
  const preview = document.querySelector<HTMLElement>("#size-preview-second");
  const existingControls = document.querySelector<HTMLElement>("#canvas-composition-controls");
  const comparisonPreview = document.querySelector<HTMLElement>("#size-preview-first");
  if (!preview || !existingControls || !comparisonPreview) {
    throw new Error("Multi-pet canvas elements not found.");
  }

  const elements = { preview, existingControls, comparisonPreview };
  const tools = document.createElement("div");
  tools.className = "multi-pet-tools";
  tools.hidden = true;

  const heading = document.createElement("p");
  heading.className = "composition-instruction";
  heading.textContent = "Select a pet, drag it to move, or adjust its size below.";

  const pickerLabel = document.createElement("label");
  pickerLabel.htmlFor = "multi-pet-selected";
  pickerLabel.textContent = "Selected pet";
  const picker = document.createElement("select");
  picker.id = "multi-pet-selected";

  const sizeLabel = document.createElement("label");
  sizeLabel.htmlFor = "multi-pet-size";
  sizeLabel.textContent = "Pet size";
  const sizeSlider = document.createElement("input");
  sizeSlider.id = "multi-pet-size";
  sizeSlider.type = "range";
  sizeSlider.min = String(MIN_SCALE);
  sizeSlider.max = String(MAX_SCALE);
  sizeSlider.step = "0.05";
  const sizeValue = document.createElement("output");
  sizeValue.htmlFor = sizeSlider.id;

  const shadowRow = document.createElement("label");
  shadowRow.className = "multi-pet-shadow-option";
  shadowRow.style.cssText = "display:flex;align-items:center;gap:10px;margin:12px 0;cursor:pointer;";
  const shadowToggle = document.createElement("input");
  shadowToggle.type = "checkbox";
  shadowToggle.id = "multi-pet-ground-shadow";
  shadowRow.append(shadowToggle, document.createTextNode("Soft ground shadow (full-body pets)"));

  const frontButton = document.createElement("button");
  frontButton.type = "button";
  frontButton.className = "btn btn-secondary";
  frontButton.textContent = "";
  frontButton.append(Object.assign(document.createElement("span"), {
    textContent: "▣↑", className: "layer-icon",
  }), document.createTextNode(" Move in front"));

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "btn btn-secondary";
  backButton.textContent = "";
  backButton.append(Object.assign(document.createElement("span"), {
    textContent: "▣↓", className: "layer-icon",
  }), document.createTextNode(" Move behind"));

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "btn btn-text";
  resetButton.textContent = "Reset arrangement";

  const status = document.createElement("p");
  status.className = "multi-pet-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const pickerRow = document.createElement("div");
  pickerRow.className = "multi-pet-picker";
  pickerRow.append(pickerLabel, picker);
  const sizeRow = document.createElement("div");
  sizeRow.className = "multi-pet-slider";
  sizeRow.append(sizeLabel, sizeSlider, sizeValue);
  const actionRow = document.createElement("div");
  actionRow.className = "multi-pet-actions";
  actionRow.append(backButton, frontButton, resetButton);
  tools.append(heading, pickerRow, sizeRow, shadowRow, actionRow, status);
  elements.existingControls.insertAdjacentElement("afterend", tools);

  let stage: Konva.Stage | null = null;
  let layer: Konva.Layer | null = null;
  let selectedId: string | null = null;
  let requestId = 0;
  let saveQueue: Promise<void> = Promise.resolve();
  const extracted = new Map<string, ExtractedImage>();
  function prepareSubject(subject: PortraitSubject): Promise<HTMLCanvasElement> {
    return preparePetCutout(subject);
  }
  // Preview every pet in each shape card, rather than showing only
  // the first uploaded photograph. The preview uses original photos while
  // background removal is running and the extracted composition afterwards.
  const shapeCards = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".shape-option[data-shape]"),
  );
  const fallbackUrls = new Map<string, { file: File; url: string }>();
  const fallbackImages = new Map<string, HTMLImageElement>();

  function drawShapeCards(): void {
    const subjects = orderedSubjects();
    const multiPet = subjects.length > 1;
    const activeIds = new Set(subjects.map((subject) => subject.id));
    for (const [id, stored] of fallbackUrls) {
      if (!activeIds.has(id) || subjects.find((subject) => subject.id === id)?.photo !== stored.file) {
        URL.revokeObjectURL(stored.url);
        fallbackUrls.delete(id);
        fallbackImages.delete(id);
      }
    }

    for (const card of shapeCards) {
      const illustration = card.querySelector<HTMLElement>(".shape-illustration");
      if (!illustration) continue;
      card.classList.toggle("has-pet-composition", multiPet);
      illustration.querySelector(".shape-pet-preview")?.remove();
      if (!multiPet) continue;
      const panel = document.createElement("div");
      panel.className = "shape-pet-preview";
      const shape = card.dataset.shape;
      panel.dataset.shape = shape ?? "portrait";
      const canvas = document.createElement("canvas");
      canvas.width = shape === "landscape" ? 240 : shape === "square" ? 200 : 160;
      canvas.height = shape === "landscape" ? 160 : shape === "square" ? 200 : 220;
      canvas.setAttribute("aria-hidden", "true");
      panel.append(canvas);
      illustration.append(panel);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#eee7dd";
      ctx.fillRect(0, 0, width, height);
      for (const subject of subjects.slice().sort((a, b) => a.layer - b.layer)) {
        const cutout = extracted.get(subject.id);
        if (cutout?.file !== subject.photo || !hasGroundShadow(subject.id)) continue;
        const scale = height * BASE_HEIGHT / cutout.image.height * subject.scale;
        drawGroundShadow(ctx, cutout.image,
          subject.position.x * width, subject.position.y * height, scale);
      }
      for (const subject of subjects.slice().sort((a, b) => a.layer - b.layer)) {
        const cutout = extracted.get(subject.id);
        if (cutout?.file === subject.photo) {
          const source = cutout.image;
          const scale = height * BASE_HEIGHT / source.height * subject.scale;
          ctx.save();
          ctx.translate(subject.position.x * width, subject.position.y * height);
          ctx.rotate(subject.rotation * Math.PI / 180);
          ctx.drawImage(source, -source.width * scale / 2, -source.height * scale / 2,
            source.width * scale, source.height * scale);
          ctx.restore();
          continue;
        }
        // Immediately show the original uploaded photograph until extraction finishes.
        let cached = fallbackUrls.get(subject.id);
        if (!cached || cached.file !== subject.photo) {
          if (cached) URL.revokeObjectURL(cached.url);
          cached = { file: subject.photo, url: URL.createObjectURL(subject.photo) };
          fallbackUrls.set(subject.id, cached);
          const image = new Image();
          fallbackImages.set(subject.id, image);
          image.onload = () => drawShapeCards();
          image.src = cached.url;
        }
        const image = fallbackImages.get(subject.id);
        if (image?.complete && image.naturalWidth > 0) {
          const slotWidth = width / subjects.length;
          const index = subjects.indexOf(subject);
          const cellHeight = height * 0.55;
          const cellWidth = slotWidth * 0.92;
          const fit = Math.min(cellWidth / image.naturalWidth, cellHeight / image.naturalHeight);
          const w = image.naturalWidth * fit;
          const h = image.naturalHeight * fit;
          ctx.drawImage(image, (index + 0.5) * slotWidth - w / 2, (height - h) / 2, w, h);
        }
      }
    }
  }
  const shapes = new Map<string, Konva.Image>();
  const shadowShapes = new Map<string, Konva.Image>();
  // The customer sees loading progress while local AI processes each photograph.
  const loadingPanel = document.createElement("div");
  loadingPanel.className = "multi-pet-loading";
  loadingPanel.hidden = true;
  loadingPanel.setAttribute("role", "status");
  loadingPanel.setAttribute("aria-live", "polite");
  const spinner = document.createElement("span");
  spinner.className = "multi-pet-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const loadingMessage = document.createElement("strong");
  const loadingDetail = document.createElement("span");
  const loadingProgress = document.createElement("progress");
  loadingProgress.max = 100;
  loadingProgress.value = 0;
  loadingPanel.append(spinner, loadingMessage, loadingDetail, loadingProgress);
  elements.preview.append(loadingPanel);

  function setLoading(message: string, detail: string, percent: number): void {
    loadingPanel.hidden = false;
    loadingMessage.textContent = message;
    loadingDetail.textContent = detail;
    loadingProgress.value = percent;
    status.textContent = detail;
  }

  function hideLoading(): void {
    loadingPanel.hidden = true;
  }
  // Show all original photos immediately while cutouts are being prepared.
  let instantPreview: HTMLDivElement | null = null;
  const instantUrls = new Map<string, { file: File; url: string }>();

  function showInstantPreview(): void {
    instantPreview?.remove();
    const subjects = atelierState.portrait.subjects;
    if (subjects.length < 2) return;
    instantPreview = document.createElement("div");
    instantPreview.className = "multi-pet-instant-preview";
    instantPreview.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:space-evenly;gap:8px;padding:12px;pointer-events:none;overflow:hidden;";
    for (const subject of subjects) {
      let stored = instantUrls.get(subject.id);
      if (!stored || stored.file !== subject.photo) {
        if (stored) URL.revokeObjectURL(stored.url);
        stored = { file: subject.photo, url: URL.createObjectURL(subject.photo) };
        instantUrls.set(subject.id, stored);
      }
      const image = document.createElement("img");
      image.src = stored.url;
      image.alt = "";
      image.style.cssText =
        `display:block;max-width:${Math.floor(90 / subjects.length)}%;max-height:65%;object-fit:contain;border-radius:3px;`;
      instantPreview.append(image);
    }
    elements.preview.append(instantPreview);
  }

  function hideInstantPreview(): void {
    instantPreview?.remove();
    instantPreview = null;
  }

  let comparisonCanvas: HTMLCanvasElement | null = null;

  // Mirror the same arrangement in the comparison canvas without making
  // a second, independently editable Konva stage.
  function drawComparison(): void {
    const holder = elements.comparisonPreview;
    const visible = atelierState.portrait.subjects.length > 1 &&
      !holder.closest("figure")?.hidden &&
      !holder.classList.contains("is-unselected") &&
      holder.clientWidth > 0 && holder.clientHeight > 0;
    holder.classList.toggle("is-multi-pet-comparison", visible);
    if (!visible) {
      comparisonCanvas?.remove();
      comparisonCanvas = null;
      return;
    }
    if (!comparisonCanvas || !comparisonCanvas.isConnected) {
      comparisonCanvas = document.createElement("canvas");
      comparisonCanvas.className = "multi-pet-comparison-canvas";
      comparisonCanvas.setAttribute("aria-hidden", "true");
      holder.append(comparisonCanvas);
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = holder.clientWidth;
    const height = holder.clientHeight;
    comparisonCanvas.width = Math.max(1, Math.round(width * ratio));
    comparisonCanvas.height = Math.max(1, Math.round(height * ratio));
    const ctx = comparisonCanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const subject of orderedSubjects()) {
      const item = extracted.get(subject.id);
      if (!item || item.file !== subject.photo || !hasGroundShadow(subject.id)) continue;
      const scale = height * BASE_HEIGHT / item.image.height * subject.scale;
      drawGroundShadow(ctx, item.image, subject.position.x * width,
        subject.position.y * height, scale);
    }
    for (const subject of orderedSubjects()) {
      const item = extracted.get(subject.id);
      if (!item || item.file !== subject.photo) continue;
      const scale = height * BASE_HEIGHT / item.image.height * subject.scale;
      ctx.save();
      ctx.translate(subject.position.x * width, subject.position.y * height);
      ctx.rotate(subject.rotation * Math.PI / 180);
      ctx.drawImage(item.image,
        -item.image.width * scale / 2, -item.image.height * scale / 2,
        item.image.width * scale, item.image.height * scale);
      ctx.restore();
    }
  }

  function save(): void {
    const snapshot = atelierState.portrait.subjects.map((subject) => ({
      ...subject,
      position: { ...subject.position },
      referencePhotos: [...subject.referencePhotos],
    }));
    saveQueue = saveQueue.catch(() => {}).then(() => savePortraitSubjects(snapshot))
      .catch(() => { status.textContent = "Your arrangement could not be saved."; });
  }

  function isActive(): boolean {
    // Multi-pet arranging begins BEFORE choosing a physical canvas size.
    return atelierState.portrait.subjects.length > 1 &&
      elements.preview.clientWidth > 0 && elements.preview.clientHeight > 0;
  }

  function destroyStage(): void {
    stage?.destroy();
    stage = null;
    layer = null;
    shapes.clear();
    shadowShapes.clear();
    elements.preview.querySelector(".multi-pet-stage")?.remove();
  }

  function orderedSubjects(): PortraitSubject[] {
    return [...atelierState.portrait.subjects].sort((a, b) => a.layer - b.layer);
  }

  function setSelected(id: string): void {
    selectedId = id;
    picker.value = id;
    const subject = atelierState.portrait.subjects.find((item) => item.id === id);
    if (!subject) return;
    sizeSlider.value = String(subject.scale);
    shadowToggle.checked = hasGroundShadow(id);
    sizeValue.textContent = `${Math.round(subject.scale * 100)}%`;
    shapes.forEach((shape, shapeId) => {
      shape.stroke(shapeId === id ? "#fff9eb" : "");
      shape.strokeWidth(shapeId === id ? 2 : 0);
      shape.dash(shapeId === id ? [5, 4] : []);
    });
    layer?.batchDraw();
  }

  function applyPositions(): void {
    if (!stage) return;
    const width = stage.width();
    const height = stage.height();
    for (const subject of atelierState.portrait.subjects) {
      const shape = shapes.get(subject.id);
      const item = extracted.get(subject.id);
      if (!shape || !item) continue;
      const base = height * BASE_HEIGHT / item.image.height;
      const actualScale = base * subject.scale;
      shape.position({ x: subject.position.x * width, y: subject.position.y * height });
      shape.scale({ x: actualScale, y: actualScale });
      shape.rotation(subject.rotation);
      const shadow = shadowShapes.get(subject.id);
      if (shadow) {
        const box = groundShadowBounds(item.image, shape.x(), shape.y(), actualScale);
        shadow.position({ x: box.x, y: box.y });
        shadow.size({ width: box.width, height: box.height });
        shadow.visible(hasGroundShadow(subject.id));
      }
    }
    layer?.batchDraw();
    drawComparison();
    drawShapeCards();
    document.dispatchEvent(new Event("atelier:composition-changed"));
  }

  function buildStage(): void {
    destroyStage();
    if (!isActive()) return;
    const holder = document.createElement("div");
    holder.className = "multi-pet-stage";
    elements.preview.append(holder);
    stage = new Konva.Stage({
      container: holder,
      width: elements.preview.clientWidth,
      height: elements.preview.clientHeight,
    });
    layer = new Konva.Layer();
    stage.add(layer);

    // All ground shadows are below every pet; no shadow can cover another pet.
    for (const subject of orderedSubjects()) {
      const item = extracted.get(subject.id);
      if (!item || item.file !== subject.photo) continue;
      const shadow = new Konva.Image({
        image: getGroundShadowSprite(),
        listening: false,
        visible: hasGroundShadow(subject.id),
      });
      shadowShapes.set(subject.id, shadow);
      layer.add(shadow);
    }

    for (const subject of orderedSubjects()) {
      const item = extracted.get(subject.id);
      if (!item || item.file !== subject.photo) continue;
      const shape = new Konva.Image({
        image: item.image,
        x: 0,
        y: 0,
        width: item.image.width,
        height: item.image.height,
        offsetX: item.image.width / 2,
        offsetY: item.image.height / 2,
        draggable: true,
        strokeScaleEnabled: false,
      });
      shape.on("pointerdown tap", () => setSelected(subject.id));
      shape.on("dragmove", () => {
        if (!stage) return;
        subject.position.x = clamp(shape.x() / stage.width(), 0, 1);
        subject.position.y = clamp(shape.y() / stage.height(), 0, 1);
        const shadow = shadowShapes.get(subject.id);
        if (shadow) {
          const actualScale = stage.height() * BASE_HEIGHT / item.image.height * subject.scale;
          const box = groundShadowBounds(item.image, shape.x(), shape.y(), actualScale);
          shadow.position({ x: box.x, y: box.y });
          shadow.size({ width: box.width, height: box.height });
          layer?.batchDraw();
        }
        drawComparison();
        drawShapeCards();
        document.dispatchEvent(new Event("atelier:composition-changed"));
      });
      shape.on("dragend", () => {
        applyPositions();
        save();
      });
      shapes.set(subject.id, shape);
      layer.add(shape);
    }
    applyPositions();
    if (selectedId && shapes.has(selectedId)) setSelected(selectedId);
    else if (atelierState.portrait.subjects[0]) setSelected(atelierState.portrait.subjects[0].id);
  }

  async function refresh(): Promise<void> {
    const currentRequest = ++requestId;
    const active = isActive();
    const hasSeveralPets = atelierState.portrait.subjects.length > 1;
    drawShapeCards();
    tools.hidden = !hasSeveralPets;
    elements.preview.classList.toggle("is-multi-pet-active", active);
    elements.preview.classList.toggle("is-multi-pet-before-size", active && atelierState.canvas.sizeId === null);
    destroyStage();
    hideInstantPreview();
    // canvasSizePreview replaces preview children on every size change.
    // Reattach the persistent progress UI after that replacement.
    if (active) elements.preview.append(loadingPanel);
    hideLoading();
    drawComparison();
    if (!active) {
      if (hasSeveralPets) {
        status.textContent = "Your pets will appear here when the preview is ready.";
        picker.replaceChildren();
        atelierState.portrait.subjects.forEach((subject, index) => {
          picker.add(new Option(subject.name || `Pet ${index + 1}`, subject.id));
        });
        picker.disabled = true;
        sizeSlider.disabled = true;
        frontButton.disabled = true;
        backButton.disabled = true;
        resetButton.disabled = true;
        shadowToggle.disabled = true;
      }
      return;
    }
    // Disable editing until all pet cutouts are available.
    picker.disabled = true;
    sizeSlider.disabled = true;
    frontButton.disabled = true;
    backButton.disabled = true;
    resetButton.disabled = true;
    shadowToggle.disabled = true;

    status.textContent = "Preparing your pets for the composition…";
    const subjects = atelierState.portrait.subjects;
    picker.replaceChildren();
    subjects.forEach((subject, index) => {
      const option = new Option(subject.name || `Pet ${index + 1}`, subject.id);
      picker.add(option);
    });

    // Only arrange defaults; never overwrite an existing customer arrangement.
    if (subjects.every((subject) => subject.position.x === 0.5 && subject.position.y === 0.5)) {
      subjects.forEach((subject, index) => {
        subject.position.x = (index + 1) / (subjects.length + 1);
        subject.position.y = 0.54;
      });
      save();
    }

    const pending = subjects.filter((subject) => {
      const cached = extracted.get(subject.id);
      return cached?.file !== subject.photo;
    });

    // Give immediate feedback on a first visit and when a photograph changes.
    if (pending.length > 0) {
      showInstantPreview();
      setLoading("Preparing your composition", "Starting background removal…", 0);
    }

    let completed = 0;
    for (const subject of pending) {
      if (currentRequest !== requestId) return;
      const petName = subject.name || `Pet ${subjects.indexOf(subject) + 1}`;
      setLoading("Preparing your composition",
        `Separating ${petName} from the background (${completed + 1} of ${pending.length})…`,
        Math.round(completed / pending.length * 100));
      try {
        const file = subject.photo;
        const cropped = await prepareSubject(subject);
        // Store completed results even if the layout changed while processing.
        if (atelierState.portrait.subjects.some((item) => item.id === subject.id && item.photo === file)) {
          extracted.set(subject.id, { file, image: cropped });
        }
        if (currentRequest !== requestId) return;
        drawShapeCards();
        completed++;
        setLoading("Preparing your composition",
          `${completed} of ${pending.length} photographs prepared`,
          Math.round(completed / pending.length * 100));
      } catch {
        if (currentRequest !== requestId) return;
        hideLoading();
        status.textContent =
          `We couldn't isolate ${petName}. Try a clearer photograph.`;
        return;
      }
    }
    if (currentRequest !== requestId) return;
    hideInstantPreview();
    buildStage();
    hideLoading();
    picker.disabled = false;
    sizeSlider.disabled = false;
    frontButton.disabled = false;
    backButton.disabled = false;
    resetButton.disabled = false;
    shadowToggle.disabled = false;
    status.textContent = atelierState.canvas.sizeId === null
      ? "Arrange your pets now, then choose a canvas size on the left."
      : "Drag a pet to move it. Select another pet to adjust its size.";
  }

  picker.addEventListener("change", () => setSelected(picker.value));
  shadowToggle.addEventListener("change", () => {
    if (!selectedId) return;
    setGroundShadow(selectedId, shadowToggle.checked);
    const shadow = shadowShapes.get(selectedId);
    shadow?.visible(shadowToggle.checked);
    layer?.batchDraw();
    drawComparison();
    drawShapeCards();
    document.dispatchEvent(new Event("atelier:composition-changed"));
  });
  sizeSlider.addEventListener("input", () => {
    const subject = atelierState.portrait.subjects.find((item) => item.id === selectedId);
    if (!subject) return;
    subject.scale = clamp(Number(sizeSlider.value), MIN_SCALE, MAX_SCALE);
    sizeValue.textContent = `${Math.round(subject.scale * 100)}%`;
    applyPositions();
  });
  sizeSlider.addEventListener("change", save);

  function moveLayer(direction: -1 | 1): void {
    const subjects = orderedSubjects();
    const index = subjects.findIndex((subject) => subject.id === selectedId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= subjects.length) return;
    // Reassign all layer numbers. Swapping two numbers can fail if a
    // restored composition contains duplicate or nonsequential values.
    const [selected] = subjects.splice(index, 1);
    subjects.splice(next, 0, selected);
    subjects.forEach((subject, position) => { subject.layer = position; });
    save();
    buildStage();
  }
  frontButton.addEventListener("click", () => moveLayer(1));
  backButton.addEventListener("click", () => moveLayer(-1));
  resetButton.addEventListener("click", () => {
    const subjects = atelierState.portrait.subjects;
    subjects.forEach((subject, index) => {
      subject.position = { x: (index + 1) / (subjects.length + 1), y: 0.54 };
      subject.scale = 1;
      subject.rotation = 0;
      subject.layer = index;
    });
    save();
    buildStage();
  });

  document.addEventListener("atelier:preview-updated", () => { void refresh(); });
  document.addEventListener("atelier:subjects-changed", () => { void refresh(); });
  const observer = new ResizeObserver(() => {
    if (stage) {
      stage.size({ width: elements.preview.clientWidth, height: elements.preview.clientHeight });
      applyPositions();
    }
    drawComparison();
  });
  observer.observe(elements.preview);
  observer.observe(elements.comparisonPreview);
  void refresh();
}
