import { atelierState } from "./atelierState";

type GuideTarget = { host: HTMLElement; artwork: HTMLElement; top: HTMLElement; side: HTMLElement; isFramed: boolean };

/** Reusable, non-interactive dimension guides. They never change the actual artwork size. */
export function initCanvasDimensionGuides(): void {
  const entries = [
    { host: document.querySelector<HTMLElement>("#size-preview-second")?.closest<HTMLElement>(".size-preview-item"), artwork: document.querySelector<HTMLElement>("#size-preview-second"), isFramed: false },
    { host: document.querySelector<HTMLElement>(".background-preview-frame"), artwork: document.querySelector<HTMLElement>("#background-live-preview"), isFramed: false },
    { host: document.querySelector<HTMLElement>(".frame-preview-card"), artwork: document.querySelector<HTMLElement>("#frame-stage"), isFramed: true },
  ];
  const guides: GuideTarget[] = [];
  for (const entry of entries) {
    if (!entry.host || !entry.artwork) continue;
    entry.host.classList.add("has-canvas-measurements");
    const top = document.createElement("span");
    top.className = "canvas-measurement canvas-measurement-top";
    const side = document.createElement("span");
    side.className = "canvas-measurement canvas-measurement-side";
    top.setAttribute("aria-hidden", "true");
    side.setAttribute("aria-hidden", "true");
    entry.host.append(top, side);
    guides.push({ host: entry.host, artwork: entry.artwork, top, side, isFramed: entry.isFramed });
  }

  const roomLabel = document.querySelector<HTMLElement>("#room-canvas-dimensions");
  let scheduled = false;
  function update(): void {
    scheduled = false;
    const width = atelierState.canvas.width;
    const height = atelierState.canvas.height;
    const valid = width !== null && height !== null && width > 0 && height > 0;
    if (roomLabel) {
      roomLabel.textContent = valid ? `Your painting · ${width} × ${height} cm` : "Choose a canvas size in Step 3";
    }
    for (const guide of guides) {
      const { host, artwork, top, side, isFramed } = guide;
      host.classList.toggle("has-measurement-values", valid);
      if (!valid) continue;
      const hostRect = host.getBoundingClientRect();
      const artRect = artwork.getBoundingClientRect();
      if (!artRect.width || !artRect.height) continue;
      // Frame is rendered outside the painting: labels align with the painting, not the moulding.
      const offset = isFramed ? Number.parseFloat(getComputedStyle(artwork).getPropertyValue("--frame-thickness")) || 0 : 0;
      const left = artRect.left - hostRect.left;
      const y = artRect.top - hostRect.top;
      top.textContent = `${width} cm`;
      side.textContent = `${height} cm`;
      top.style.left = `${left}px`;
      top.style.top = `${y - offset - 24}px`;
      top.style.width = `${artRect.width}px`;
      side.style.left = `${left - offset - 34}px`;
      side.style.top = `${y}px`;
      side.style.height = `${artRect.height}px`;
    }
  }
  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }
  const observer = new ResizeObserver(schedule);
  guides.forEach(({ host, artwork }) => { observer.observe(host); observer.observe(artwork); });
  document.addEventListener("atelier:size-changed", schedule);
  document.addEventListener("atelier:shape-changed", schedule);
  for (const name of ["atelier:canvas-screen-opened", "atelier:background-screen-opened", "atelier:frame-screen-opened", "atelier:room-screen-opened"]) {
    document.addEventListener(name, schedule);
  }
  schedule();
}
