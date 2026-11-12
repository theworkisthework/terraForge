import type { CanvasLayout, LayerGroup, PageTemplate, SvgImport } from "../../../../../types";

/** The layout format this version writes, and the newest it can read. */
export const LAYOUT_VERSION = 1;

type Json = Record<string, unknown>;
type Kind = "string" | "number" | "boolean";
/** Says what an object is in an error message; called only if there is one, as a layout can hold a million paths. */
type Where = () => string;

const EXPECTED: Record<Kind, string> = { string: "text", number: "a number", boolean: "true or false" };
const REQUIRED = Symbol("required");

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const wrong = (where: Where, key: string, expected: string) => new Error(`${where()}: "${key}" should be ${expected}.`);

/**
 * Checks one field of `source`, in place. A value of the wrong kind is an
 * error. A missing one is an error if the field is REQUIRED, is set to
 * `fallback` if there is one, and is otherwise left absent.
 *
 * null counts as missing: it is what JSON makes of NaN and undefined.
 */
function field(source: Json, where: Where, key: string, kind: Kind, fallback?: string | number | boolean | typeof REQUIRED) {
  const value = source[key];
  if (value === undefined || value === null) {
    if (fallback === REQUIRED) throw wrong(where, key, EXPECTED[kind]);
    if (fallback === undefined) delete source[key];
    else source[key] = fallback;
  } else if (kind === "number" ? !isNumber(value) : typeof value !== kind) {
    throw wrong(where, key, EXPECTED[kind]);
  }
}

/** As `field`, for a list: returns it, or null if the file has none. */
function list(source: Json, where: Where, key: string, expected: string, required = false): unknown[] | null {
  const value = source[key];
  if (value === undefined || value === null) {
    if (required) throw wrong(where, key, expected);
    delete source[key];
    return null;
  }
  if (!Array.isArray(value)) throw wrong(where, key, expected);
  return value;
}

function checkPath(path: unknown, where: Where) {
  if (!isObject(path)) throw new Error(`${where()} is not a path.`);
  field(path, where, "id", "string", REQUIRED);
  field(path, where, "d", "string", REQUIRED);
  field(path, where, "svgSource", "string", "");
  field(path, where, "visible", "boolean", true);
  field(path, where, "layer", "string");
  field(path, where, "outlineVisible", "boolean");
  field(path, where, "strokeEnabled", "boolean");
  field(path, where, "fillEnabled", "boolean");
  field(path, where, "passCount", "number");
  const hatchLines = list(path, where, "hatchLines", "a list of path strings");
  if (hatchLines?.some((line) => typeof line !== "string")) throw wrong(where, "hatchLines", "a list of path strings");
}

function checkImport(imp: unknown, index: number): asserts imp is SvgImport & Json {
  const position = `Import ${index + 1}`;
  if (!isObject(imp)) throw new Error(`${position} is not an import.`);
  const name = typeof imp.name === "string" && imp.name ? ` ("${imp.name}")` : "";
  const where = () => position + name;

  field(imp, where, "id", "string", REQUIRED);
  field(imp, where, "name", "string", "Untitled");
  for (const key of ["x", "y", "scale", "svgWidth", "svgHeight"]) field(imp, where, key, "number", REQUIRED);
  if (imp.scale === 0) throw wrong(where, "scale", "a number other than zero");
  field(imp, where, "rotation", "number", 0);
  field(imp, where, "viewBoxX", "number", 0);
  field(imp, where, "viewBoxY", "number", 0);
  field(imp, where, "visible", "boolean", true);
  for (const key of ["scaleX", "scaleY", "hatchSpacingMM", "hatchAngleDeg", "strokeWidthMM"]) field(imp, where, key, "number");
  for (const key of ["hatchEnabled", "strokeEnabled", "plotPointsEnabled", "generatedStrokeForNoStroke"]) {
    field(imp, where, key, "boolean");
  }
  for (const key of ["bitmapDataUrl", "bitmapRendererPath", "bitmapRendererId"]) field(imp, where, key, "string");

  const paths = list(imp, where, "paths", "a list of paths", true) ?? [];
  paths.forEach((path, i) => checkPath(path, () => `${where()}, path ${i + 1}`));

  list(imp, where, "layers", "a list of layers")?.forEach((layer, i) => {
    const whereLayer = () => `${where()}, layer ${i + 1}`;
    if (!isObject(layer)) throw new Error(`${whereLayer()} is not a layer.`);
    field(layer, whereLayer, "id", "string", REQUIRED);
    field(layer, whereLayer, "name", "string", layer.id as string);
    field(layer, whereLayer, "visible", "boolean", true);
  });
}

/**
 * Layer groups as the file has them, less anything that points nowhere: an
 * id that is no import's is dropped, and an import listed in two groups stays
 * only in the first. (Files saved before imports were taken out of their
 * group on deletion can hold such ids.)
 */
function parseLayerGroups(layout: Json, imports: SvgImport[]): LayerGroup[] {
  const groups = list(layout, () => "Layout file", "layerGroups", "a list of groups") ?? [];
  const unassigned = new Set(imports.map((imp) => imp.id));
  const groupIds = new Set<unknown>();
  return groups.map((group, index) => {
    const where = () => `Layer group ${index + 1}`;
    if (!isObject(group)) throw new Error(`${where()} is not a group.`);
    field(group, where, "id", "string", REQUIRED);
    field(group, where, "name", "string", `Group ${index + 1}`);
    field(group, where, "color", "string", "#000000");
    if (groupIds.has(group.id)) throw new Error(`${where()}: another group already has the id "${group.id}".`);
    groupIds.add(group.id);
    const importIds = (list(group, where, "importIds", "a list of import ids", true) ?? []).filter(
      (id): id is string => typeof id === "string" && unassigned.delete(id),
    );
    return { ...(group as unknown as LayerGroup), importIds };
  });
}

function parsePageTemplate(layout: Json): PageTemplate | null {
  const page = layout.pageTemplate;
  if (page === undefined || page === null) return null;
  const where = () => "Page";
  if (!isObject(page)) throw wrong(() => "Layout file", "pageTemplate", "a page");
  field(page, where, "sizeId", "string", REQUIRED);
  field(page, where, "landscape", "boolean", false);
  field(page, where, "marginMM", "number", 0);
  if ((page.marginMM as number) < 0) throw wrong(where, "marginMM", "zero or more");
  field(page, where, "paperColor", "string");
  field(page, where, "penColor", "string");
  return page as unknown as PageTemplate;
}

/**
 * Reads the text of a `.tforge` file, or throws an Error saying what is
 * wrong with it.
 *
 * A layout goes straight into the canvas store, where a missing position or
 * a path that is not a string does not fail cleanly: it draws nothing, or
 * NaN coordinates reach the G-code. So the fields the canvas and the G-code
 * depend on are checked here, before anything on the canvas is replaced.
 * Fields with an obvious default (`visible`, `rotation`) are filled in;
 * fields this version does not know are kept as they are.
 */
export function parseLayout(text: string): CanvasLayout {
  let layout: unknown;
  try {
    layout = JSON.parse(text);
  } catch {
    throw new Error("Not a valid terraForge layout file.");
  }
  if (!isObject(layout)) throw new Error("Not a valid terraForge layout file.");

  // Layouts have always been written with a version; one without is taken to be the first.
  const version = layout.tfVersion ?? 1;
  if (!isNumber(version) || version < 1) throw new Error("Not a valid terraForge layout file.");
  if (version > LAYOUT_VERSION) {
    throw new Error(
      `This layout was saved by a newer version of terraForge (layout format ${version}; this version reads up to ${LAYOUT_VERSION}). Update terraForge to open it.`,
    );
  }

  if (!Array.isArray(layout.imports)) {
    throw new Error("Layout file does not contain a valid imports array.");
  }
  const imports: SvgImport[] = layout.imports.map((imp: unknown, index) => {
    checkImport(imp, index);
    return imp;
  });
  const ids = new Set<string>();
  imports.forEach((imp, index) => {
    if (ids.has(imp.id)) throw new Error(`Import ${index + 1} ("${imp.name}"): another import already has the id "${imp.id}".`);
    ids.add(imp.id);
  });

  return {
    tfVersion: version,
    savedAt: typeof layout.savedAt === "string" ? layout.savedAt : "",
    imports,
    layerGroups: parseLayerGroups(layout, imports),
    pageTemplate: parsePageTemplate(layout),
  };
}
