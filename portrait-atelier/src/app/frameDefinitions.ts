import type { FrameStyle } from "./frameRendererV2";

/**
 * Frame catalogue — Stage 1.
 *
 * Preview widths are DESIGN ESTIMATES, not measurements of physical mouldings.
 * Keep the customer's artwork dimensions fixed: the frame extends outwards.
 * Asset paths are recorded here for later use by a catalogue-based renderer;
 * the existing renderer still loads the current PNGs unchanged.
 */
export interface FrameDefinition {
  id: Exclude<FrameStyle, "none">;
  label: string;
  assets: {
    corner: string;
    edge: string;
  };
  geometry: {
    /** Preview-only thickness divided by the displayed artwork width. */
    previewWidthRatio: number;
    /** Minimum and maximum frame thickness in CSS pixels. */
    minPreviewPx: number;
    maxPreviewPx: number;
    /** Actual moulding size will be populated from a supplier catalogue. */
    mouldingWidthMm: number | null;
  };
  rendering: {
    /** Describes the eventual asset handling. Stage 1 keeps the legacy renderer. */
    /** Stage 2: repeat preserves texture scale; stretch is for nonrepeating rails. */
    plannedRailMode: "stretch" | "repeat" | "segmented";
    /** Distance from the corner's outer edge to its inner opening, in source pixels. */
    profileDepthPx: number;
    /** Source crop for the straight rail, ignoring transparency/padding. */
    railCrop: { x: number; y: number; width: number; height: number };
  };
}

export const FRAME_DEFINITIONS: Record<Exclude<FrameStyle, "none">, FrameDefinition> = {
  rustic: {
    id: "rustic",
    label: "Rustic wood",
    assets: {
      corner: "/frames/rustic-corner.png",
      edge: "/frames/rustic-edge.png",
    },
    geometry: {
      previewWidthRatio: 0.065,
      minPreviewPx: 9,
      maxPreviewPx: 32,
      mouldingWidthMm: null,
    },
    rendering: { plannedRailMode: "stretch", profileDepthPx: 278, railCrop: {x: 0, y: 0, width: 960, height: 277} },
  },
  "antique-gold": {
    id: "antique-gold",
    label: "Antique gold",
    assets: {
      corner: "/frames/antique-gold-corner.png",
      edge: "/frames/antique-gold-edge.png",
    },
    geometry: {
      previewWidthRatio: 0.085,
      minPreviewPx: 12,
      maxPreviewPx: 38,
      mouldingWidthMm: null,
    },
    rendering: { plannedRailMode: "stretch", profileDepthPx: 278, railCrop: {x: 0, y: 0, width: 50, height: 278} },
  },
  "natural-wood": {
    id: "natural-wood",
    label: "Natural wood",
    assets: {
      corner: "/frames/natural-wood-corner.png",
      edge: "/frames/natural-wood-edge.png",
    },
    geometry: {
      previewWidthRatio: 0.055,
      minPreviewPx: 8,
      maxPreviewPx: 28,
      mouldingWidthMm: null,
    },
    rendering: { plannedRailMode: "stretch", profileDepthPx: 278, railCrop: {x: 0, y: 0, width: 86, height: 278} },
  },
};

/** Frame thickness for the preview only; 0 means no frame. */
export function getFramePreviewThickness(style: FrameStyle, artworkWidthPx: number): number {
  if (style === "none") return 0;
  const { previewWidthRatio, minPreviewPx, maxPreviewPx } = FRAME_DEFINITIONS[style].geometry;
  const desired = Math.round(artworkWidthPx * previewWidthRatio);
  return Math.max(minPreviewPx, Math.min(maxPreviewPx, desired));
}
