/**
 * Turning an SVG file's text into an import: its size and units, layers,
 * shapes as absolute paths with their colours, placement on the bed, and
 * default hatching for filled shapes.
 */
import { v4 as uuid } from "uuid";
import {
  findContainingLayerId,
  getEffectiveFill,
  getEffectiveStrokeColor,
  getLayerName,
  hasVisibleStroke,
  isDisplayNone,
  isLayerGroup,
  normalizeSvgColor,
  parseSvgStylesheet,
  resolveSvgUserSpace,
  shapeToPathD,
  type SvgStylesheet,
} from "./svgImportHelpers";
import { getAccumulatedTransform, applyMatrixToPathD, computeImportPathBounds } from "../../../utils/svgTransform";
import { generateHatchPaths } from "../../../utils/hatchFill";
import {
  type MachineConfig,
  type SvgImport,
  type SvgPath,
  type SvgLayer,
  DEFAULT_HATCH_SPACING_MM,
  DEFAULT_HATCH_ANGLE_DEG,
} from "../../../../../types";

const SHAPES = "path, rect, circle, ellipse, line, polyline, polygon";

/** The viewBox (falling back to width/height), and mm per user unit from
 * the document's physical size — 96 DPI when it has none. */
function svgFrame(svgEl: Element | null) {
  const { width, height, ...rest } = resolveSvgUserSpace(svgEl);
  return { ...rest, svgWidth: width, svgHeight: height };
}

/** Layer groups (<g> with Inkscape or display markers), giving any without
 * an id one, so paths can be matched to them. */
function svgLayers(doc: Document, stylesheet: SvgStylesheet): SvgLayer[] {
  const groupEls = Array.from(doc.querySelectorAll("g")).filter(
    (g) => !g.closest("defs, clipPath, mask, symbol") && isLayerGroup(g),
  );
  const layers = groupEls.map((g, i) => ({ id: g.id || `layer_${i}`, name: getLayerName(g, i), visible: !isDisplayNone(g, stylesheet) }));
  groupEls.forEach((g, i) => {
    if (!g.id) g.id = `layer_${i}`;
  });
  return layers;
}

/** Whether no ancestor hides an element — a hidden layer group still
 * imports (as a hidden layer), any other hidden group does not. */
function shownByAncestors(el: Element, stylesheet: SvgStylesheet, layerIds: Set<string>): boolean {
  let cur = el.parentElement;
  while (cur && cur.tagName.toLowerCase() !== "svg") {
    if (isDisplayNone(cur, stylesheet) && !(cur.id && layerIds.has(cur.id))) return false;
    cur = cur.parentElement;
  }
  return true;
}

/** A circle's centre, transformed — where a pen tap plots it. */
function circleTap(el: Element, matrix: DOMMatrix): { x: number; y: number } | undefined {
  const cx = Number.parseFloat(el.getAttribute("cx") ?? "");
  const cy = Number.parseFloat(el.getAttribute("cy") ?? "");
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return undefined;
  const pt = matrix.transformPoint({ x: cx, y: cy, z: 0, w: 1 });
  return { x: pt.x, y: pt.y };
}

/** An element's display label: its Inkscape label, <title>, or own id, else
 * its tag and position. */
function shapeLabel(el: Element, tag: string, index: number): string {
  const inkLabel =
    el.getAttribute("inkscape:label") ?? el.getAttributeNS("http://www.inkscape.org/namespaces/inkscape", "label");
  const titleText = el.querySelector(":scope > title")?.textContent?.trim();
  const ownId = el.id && !/^[a-f0-9-]{36}$/.test(el.id) ? el.id : undefined;
  return inkLabel?.trim() || titleText || ownId || `${tag}_${index}`;
}

/** A shape element as an absolute path in document coordinates, with its
 * colours, outline visibility, tap point and label. */
function shapeToSvgPath(
  el: Element,
  index: number,
  stylesheet: SvgStylesheet,
  layerIds: Set<string>,
): SvgPath | null {
  const rawD = shapeToPathD(el);
  if (!rawD) return null;
  const matrix = getAccumulatedTransform(el);
  // No per-path viewBox culling: complex Illustrator paths can yield noisy
  // bounds while parsing, dropping parts of the artwork.
  const effectiveFill = getEffectiveFill(el, stylesheet);
  const effectiveStroke = getEffectiveStrokeColor(el, stylesheet);
  const fillColor = effectiveFill ? normalizeSvgColor(effectiveFill) : undefined;
  const strokeColor = effectiveStroke ? normalizeSvgColor(effectiveStroke) : undefined;
  const sourceOutlineVisible = hasVisibleStroke(el, stylesheet);
  const tag = el.tagName.toLowerCase();
  return {
    id: uuid(),
    d: applyMatrixToPathD(rawD, matrix),
    svgSource: el.outerHTML,
    visible: true,
    hasFill: effectiveFill !== null,
    fillColor,
    strokeColor,
    sourceColor: fillColor ?? strokeColor,
    sourceOutlineVisible,
    outlineVisible: sourceOutlineVisible,
    strokeEnabled: true,
    pointTap: tag === "circle" ? circleTap(el, matrix) : undefined,
    label: shapeLabel(el, tag, index),
    layer: findContainingLayerId(el, layerIds),
  };
}

/** Where a new import lands: against the machine origin's corner. */
function initialPosition(objW: number, objH: number, machine: MachineConfig | undefined) {
  const origin = machine?.origin ?? "bottom-left";
  const bedW = machine?.bedWidth ?? 220;
  return {
    x: origin === "bottom-right" || origin === "top-right" ? bedW - objW : 0,
    y: origin === "top-left" || origin === "top-right" ? -objH : 0,
  };
}

/** Filled shapes get hatching at the default spacing and angle. */
function withDefaultHatching(paths: SvgPath[], scale: number): SvgPath[] {
  if (!(scale > 0)) return paths;
  const spacingUnits = DEFAULT_HATCH_SPACING_MM / scale;
  return paths.map((path) => {
    if (!path.hasFill) return path;
    const hatchLines = generateHatchPaths(path.d, spacingUnits, DEFAULT_HATCH_ANGLE_DEG);
    return hatchLines.length ? { ...path, hatchLines } : path;
  });
}

export type SvgImportResult =
  | { imp: SvgImport; skippedTextCount: number }
  | { imp: null; skippedTextCount: number };

/**
 * An import from SVG text, or `imp: null` if it has no drawable shapes.
 * Text is not converted; `skippedTextCount` says how much was left out.
 */
export function buildSvgImport(raw: string, name: string, machine: MachineConfig | undefined): SvgImportResult {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const stylesheet = parseSvgStylesheet(doc);
  const frame = svgFrame(doc.querySelector("svg"));
  const layers = svgLayers(doc, stylesheet);
  const layerIds = new Set(layers.map((l) => l.id));

  const skippedTextCount = Array.from(doc.querySelectorAll("text")).filter(
    (textEl) => !textEl.closest("defs, clipPath, mask, symbol") && shownByAncestors(textEl, stylesheet, layerIds),
  ).length;

  const paths: SvgPath[] = [];
  for (const el of Array.from(doc.querySelectorAll(SHAPES))) {
    if (!shownByAncestors(el, stylesheet, layerIds)) continue;
    // Numbered by shapes that produce a path, from 1.
    const path = shapeToSvgPath(el, paths.length + 1, stylesheet, layerIds);
    if (path) paths.push(path);
  }
  if (paths.length === 0) return { imp: null, skippedTextCount };

  // Normalise to the drawing's own bounds rather than the viewBox.
  const pathDs = paths.map((p) => p.d);
  const bounds = computeImportPathBounds(pathDs);
  const effW = bounds ? bounds.maxX - bounds.minX : frame.svgWidth;
  const effH = bounds ? bounds.maxY - bounds.minY : frame.svgHeight;
  const { x, y } = initialPosition(effW * frame.scale, effH * frame.scale, machine);

  const imp: SvgImport = {
    id: uuid(),
    name,
    paths: withDefaultHatching(paths, frame.scale),
    x,
    y,
    scale: frame.scale,
    rotation: 0,
    visible: true,
    svgWidth: effW,
    svgHeight: effH,
    viewBoxX: bounds?.minX ?? frame.viewBoxX,
    viewBoxY: bounds?.minY ?? frame.viewBoxY,
    hatchEnabled: true,
    hatchSpacingMM: DEFAULT_HATCH_SPACING_MM,
    hatchAngleDeg: DEFAULT_HATCH_ANGLE_DEG,
    strokeEnabled: true,
    plotPointsEnabled: false,
    generatedStrokeForNoStroke: false,
    layers: layers.length > 0 ? layers : undefined,
  };
  return { imp, skippedTextCount };
}
