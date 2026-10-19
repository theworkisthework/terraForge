import type { BitmapRendererFieldSchema, BitmapRendererSettings, RendererContext, RendererDot } from "../../../../types";
import { coerceSettings } from "./coerceSettings";
import { angleField, DEFAULT_ANGLE_DEG, DEFAULT_ORIGIN_PCT, originFields } from "./sharedFields";
import { luminanceAt } from "./toneSpine/sampling";
import type { BitmapRendererDefinition } from "./types";

export const DOT_HALFTONE_RENDERER_ID = "dot-halftone";
const DEFAULT_DOT_SCALE = 1;
const DOT_SEGMENTS = 20;
/** Hex/triangular packing: rows spaced at `spacing * ROW_SPACING_RATIO`
 * with alternate rows offset by half a cell gives every dot six equidistant
 * neighbours (all at `spacing`), packing more evenly than a square grid. */
const ROW_SPACING_RATIO = Math.sqrt(3) / 2;
/** Below this tone darkness (0–1) a cell is light enough to leave blank
 * rather than emit a barely-there closed loop — every dot costs a pen down
 * and up, so near-white areas must not fill with specks. */
const MIN_DOT_TONE = 0.05;

export const dotHalftoneDefaults: BitmapRendererSettings = {
  spacingMM: 3,
  dotScale: DEFAULT_DOT_SCALE,
  angleDeg: DEFAULT_ANGLE_DEG,
  originXPct: DEFAULT_ORIGIN_PCT,
  originYPct: DEFAULT_ORIGIN_PCT,
};

const HALFTONE_FIELDS: BitmapRendererFieldSchema[] = [
  { type: "number", key: "spacingMM", label: "Cell spacing (mm)", min: 0.1, max: 50, step: 0.1 },
  { type: "number", key: "dotScale", label: "Dot scale", min: 0.5, max: 3, step: 0.05 },
  angleField(),
  ...originFields(),
];

function format(value: number): string {
  return Number(value.toFixed(2)).toString();
}

type Point = { x: number; y: number };

/**
 * Clips a convex polygon to the `[0,width] x [0,height]` rectangle
 * (Sutherland–Hodgman, one edge at a time). A dot is always convex, so the
 * result is a single convex polygon — still one closed, fillable dot.
 */
function clipToRect(polygon: Point[], width: number, height: number): Point[] {
  const edges: [(p: Point) => number][] = [[(p) => p.x], [(p) => width - p.x], [(p) => p.y], [(p) => height - p.y]];
  let output = polygon;
  for (const [inside] of edges) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const dCurrent = inside(current);
      const dPrevious = inside(previous);
      if (dCurrent >= 0 !== dPrevious >= 0) {
        const t = dPrevious / (dPrevious - dCurrent);
        output.push({ x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t });
      }
      if (dCurrent >= 0) output.push(current);
    }
    if (output.length === 0) break;
  }
  return output;
}

/**
 * One dot's closed polyline-circle outline, clipped to the image so a dot at
 * the edge — or any dot, with a dot scale above 1 — never spills past it.
 * Polylines rather than arcs so every downstream consumer (hatch fill,
 * G-code) handles it as-is. Null if nothing of it lies inside the image.
 */
function circlePath(cx: number, cy: number, radius: number, width: number, height: number): string | null {
  const circle = Array.from({ length: DOT_SEGMENTS }, (_, i) => {
    const theta = (i / DOT_SEGMENTS) * Math.PI * 2;
    return { x: cx + radius * Math.cos(theta), y: cy + radius * Math.sin(theta) };
  });
  const clipped = clipToRect(circle, width, height);
  if (clipped.length < 3) return null;
  return `${clipped.map((p, i) => `${i === 0 ? "M" : "L"}${format(p.x)} ${format(p.y)}`).join(" ")} Z`;
}

/**
 * A rotated, origin-anchored grid of dots, one per cell, area proportional
 * to the source tone sampled at that cell's centre — classic halftone
 * screening. `angleDeg` is the screen angle; `dotScale` lets 100%-black
 * cells slightly overlap their neighbours (>1) or stay inset (<1), matching
 * how a real halftone screen's dot gain is tuned.
 */
export function generateHalftoneDots({ source, settings: rawSettings, scale, width, height, ink }: RendererContext): RendererDot[] {
  if (!source || width < 1 || height < 1 || source.values.length === 0) return [];

  const settings = coerceSettings(HALFTONE_FIELDS, dotHalftoneDefaults, rawSettings);
  const pixelsPerMM = 1 / Math.max(scale, 0.001);
  const spacing = Math.max((settings.spacingMM as number) * pixelsPerMM, 0.1);
  const rowSpacing = spacing * ROW_SPACING_RATIO;
  const maxRadius = (spacing / 2) * (settings.dotScale as number);
  // Separated inks each get their own screen angle, spread through the hex
  // grid's 60° repeat (CMYK: 0°, 15°, 30°, 45°), as in print: each ink's dots
  // then sit beside the others' in a rosette instead of stacked on top.
  const inkAngle = ink?.offset ? (ink.index / ink.count) * (Math.PI / 3) : 0;
  const angleRad = ((settings.angleDeg as number) * Math.PI) / 180 + inkAngle;
  const originX = ((settings.originXPct as number) / 100) * source.width;
  const originY = ((settings.originYPct as number) / 100) * source.height;

  const u = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
  const v = { x: -Math.sin(angleRad), y: Math.cos(angleRad) };

  const corners = [
    { x: 0, y: 0 },
    { x: source.width, y: 0 },
    { x: 0, y: source.height },
    { x: source.width, y: source.height },
  ];
  const uCoords = corners.map((c) => (c.x - originX) * u.x + (c.y - originY) * u.y);
  const vCoords = corners.map((c) => (c.x - originX) * v.x + (c.y - originY) * v.y);
  // Padded by one column/row: the hex offset shifts alternate rows by half a
  // cell, so a loop range sized only for the unoffset grid can clip them
  // short — a cell that lands outside the image is skipped below, so the
  // padding costs nothing but a few wasted iterations.
  const iMin = Math.ceil(Math.min(...uCoords) / spacing) - 1;
  const iMax = Math.floor(Math.max(...uCoords) / spacing) + 1;
  const jMin = Math.ceil(Math.min(...vCoords) / rowSpacing) - 1;
  const jMax = Math.floor(Math.max(...vCoords) / rowSpacing) + 1;

  const dots: RendererDot[] = [];
  for (let j = jMin; j <= jMax; j++) {
    const rowOffset = (((j % 2) + 2) % 2) * 0.5;
    for (let i = iMin; i <= iMax; i++) {
      const cx = originX + (i + rowOffset) * spacing * u.x + j * rowSpacing * v.x;
      const cy = originY + (i + rowOffset) * spacing * u.y + j * rowSpacing * v.y;
      // A cell centred outside the image is not part of the picture; its
      // tone would only be the image edge blended with the white beyond.
      if (cx < 0 || cy < 0 || cx > source.width || cy > source.height) continue;
      const toneDark = 1 - luminanceAt(source, cx, cy) / 255;
      if (toneDark < MIN_DOT_TONE) continue;
      // Ink is a dot's *area*, so it is the area that must track tone: a
      // radius proportional to tone gives area ∝ tone², printing a 50% grey
      // as 25% ink and crushing every midtone toward white.
      const radius = maxRadius * Math.sqrt(toneDark);
      const d = circlePath(cx, cy, radius, source.width, source.height);
      if (d) dots.push({ d, x: Number(format(cx)), y: Number(format(cy)) });
    }
  }

  return dots;
}

export const dotHalftoneRenderer: BitmapRendererDefinition = {
  id: DOT_HALFTONE_RENDERER_ID,
  label: "Dot halftone",
  source: "required",
  // Each ink's grid is turned by a share of 60°.
  inkOffset: true,
  // 2: dot area, rather than radius, proportional to tone.
  // 3: each dot's tap point is its exact centre, not its vertex average.
  // 4: dots stay inside the image — clipped at the edge, none centred outside.
  version: "4",
  defaults: dotHalftoneDefaults,
  fields: HALFTONE_FIELDS,
  // Returned as dots, so each is filled or plot-tapped on its own.
  render: (context) => ({ layers: [{ dots: generateHalftoneDots(context) }] }),
};
