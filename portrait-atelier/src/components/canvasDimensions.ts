import { atelierState } from "../app/atelierState";

/**
 * Read-only canvas dimensions shown after the customer chooses a canvas.
 * Inserts compact strips OUTSIDE the preview surfaces; never changes the
 * rendering, editor, comparison, photo, frame or room state.
 */
export function initCanvasDimensions(): void {
  const locations: Array<{ selector: string; className: string }> = [
    { selector: ".canvas-size-preview .size-preview-canvases", className: "atelier-dimensions--size" },
    { selector: ".background-studio-preview .background-preview-frame", className: "atelier-dimensions--background" },
    { selector: ".frame-preview-column .frame-preview-card", className: "atelier-dimensions--frame" },
    { selector: ".room-view-column .room-preview-card", className: "atelier-dimensions--room" },
  ];

  const labels: HTMLElement[] = [];

  for (const { selector, className } of locations) {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) {
      // A missing optional preview is not allowed to prevent Atelier startup.
      continue;
    }

    // Safe to initialise twice without duplicating labels.
    const existing = target.nextElementSibling;
    if (existing instanceof HTMLElement && existing.classList.contains("atelier-dimensions")) {
      labels.push(existing);
      continue;
    }

    const label = document.createElement("p");
    label.className = `atelier-dimensions ${className}`;
    label.setAttribute("role", "status");
    label.setAttribute("aria-live", "off");
    label.hidden = true;

    const width = document.createElement("span");
    width.className = "atelier-dimensions__width";
    const separator = document.createElement("span");
    separator.className = "atelier-dimensions__separator";
    separator.setAttribute("aria-hidden", "true");
    separator.textContent = "×";
    const height = document.createElement("span");
    height.className = "atelier-dimensions__height";

    label.append(width, separator, height);
    target.insertAdjacentElement("afterend", label);
    labels.push(label);
  }

  function update(): void {
    const { width, height } = atelierState.canvas;
    const hasDimensions = width !== null && height !== null &&
      Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;

    for (const label of labels) {
      label.hidden = !hasDimensions;
      if (!hasDimensions) continue;

      const widthLabel = label.querySelector<HTMLElement>(".atelier-dimensions__width");
      const heightLabel = label.querySelector<HTMLElement>(".atelier-dimensions__height");
      if (widthLabel) widthLabel.textContent = `Width ${width} cm`;
      if (heightLabel) heightLabel.textContent = `Height ${height} cm`;
    }
  }

  // Use existing events rather than observing all DOM mutations or installing timers.
  for (const eventName of [
    "atelier:size-changed",
    "atelier:shape-changed",
    "atelier:canvas-screen-opened",
    "atelier:background-screen-opened",
    "atelier:frame-screen-opened",
    "atelier:room-screen-opened",
  ]) {
    document.addEventListener(eventName, update);
  }

  update();
}
