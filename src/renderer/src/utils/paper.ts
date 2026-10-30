import type { PageTemplate } from "../../../types";

/**
 * Paper and pen colours: what a page template says the drawing is plotted
 * on and with. Shared by the canvas preview and the bitmap pipeline, which
 * must agree — separation solves inks against the paper the preview shows.
 */

export const DEFAULT_PAPER_COLOR = "#ffffff";
export const DEFAULT_PEN_COLOR = "#000000";

/** Paper choices offered alongside a custom colour. */
export const PAPER_PRESETS: { label: string; color: string }[] = [
  { label: "White", color: "#ffffff" },
  { label: "Cream", color: "#f3ecd8" },
  { label: "Kraft", color: "#c9a77c" },
  { label: "Grey", color: "#9a9a9a" },
  { label: "Black", color: "#141414" },
];

/** The paper and pen of a page, or null when no page is shown. */
export interface PageColors {
  paper: string;
  pen: string;
}

export function pageColors(pageTemplate: PageTemplate | null | undefined): PageColors | null {
  if (!pageTemplate) return null;
  return {
    paper: normalizeHex(pageTemplate.paperColor) ?? DEFAULT_PAPER_COLOR,
    pen: normalizeHex(pageTemplate.penColor) ?? DEFAULT_PEN_COLOR,
  };
}

/** `#rrggbb` in lower case, or null for anything that is not a hex colour. */
export function normalizeHex(color: string | undefined): string | null {
  if (!color) return null;
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].replace(/./g, (c) => c + c) : match[1];
  return `#${hex.toLowerCase()}`;
}

/** Channels 0–1. */
export function hexToRgb(color: string): [number, number, number] {
  const hex = normalizeHex(color) ?? "#000000";
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Relative luminance (Rec. 709 weights on the stored values), 0–1. */
export function luminance(color: string): number {
  const [r, g, b] = hexToRgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Whether inks on this paper darken it (light paper: transparent inks
 * multiply) rather than lighten it (dark paper: only light, opaque inks —
 * gel, paint — show, and they add light like a screen blend).
 */
export function isLightPaper(paper: string): boolean {
  return luminance(paper) >= 0.5;
}

/**
 * A colour shifted to mark a selection: toward white if it is dark, toward
 * black if it is light, so it changes visibly whatever the pen — a black pen
 * cannot be lightened by scaling, nor a white one brightened.
 */
export function selectionShade(color: string): string {
  const rgb = hexToRgb(color);
  const toward = luminance(color) < 0.5 ? 1 : 0;
  return rgbToHex(rgb.map((v) => v + (toward - v) * 0.35) as [number, number, number]);
}
