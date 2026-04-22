// SVG import helper functions extracted from Toolbar.

interface ParsedCssRule {
  declarations: Map<string, string>;
  specificity: number;
  order: number;
}

export interface SvgStylesheet {
  classes: Map<string, ParsedCssRule[]>;
  ids: Map<string, ParsedCssRule[]>;
  tags: Map<string, ParsedCssRule[]>;
}

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
};

function toHexByte(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

/** Parses supported CSS color formats to RGB. */
export function parseColorToRgb(
  color: string,
): [number, number, number] | null {
  const lower = color.toLowerCase().trim();
  if (lower in NAMED_COLORS) {
    return NAMED_COLORS[lower];
  }

  if (lower.startsWith("#")) {
    const hex = lower.slice(1);
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return [r, g, b];
      }
    } else if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return [r, g, b];
      }
    }
  }

  const rgbMatch = lower.match(
    /rgb(?:a)?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return [r, g, b];
    }
  }

  return null;
}

/** Normalizes supported CSS colors to lowercase 6-digit hex. */
export function normalizeSvgColor(color: string): string {
  const rgb = parseColorToRgb(color);
  if (!rgb) return color.trim().toLowerCase();
  return `#${toHexByte(rgb[0])}${toHexByte(rgb[1])}${toHexByte(rgb[2])}`;
}

/** Builds a compact, import-local stylesheet index for simple SVG selectors. */
export function parseSvgStylesheet(doc: Document): SvgStylesheet {
  const stylesheet: SvgStylesheet = {
    classes: new Map<string, ParsedCssRule[]>(),
    ids: new Map<string, ParsedCssRule[]>(),
    tags: new Map<string, ParsedCssRule[]>(),
  };

  const styleNodes = Array.from(doc.querySelectorAll("style"));
  let order = 0;

  for (const node of styleNodes) {
    const css = (node.textContent ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
    const blockRe = /([^{}]+)\{([^}]*)\}/g;
    for (const match of css.matchAll(blockRe)) {
      const selectorText = match[1]?.trim() ?? "";
      const body = match[2] ?? "";
      if (!selectorText) continue;

      const declarations = new Map<string, string>();
      for (const rawDecl of body.split(";")) {
        const decl = rawDecl.trim();
        if (!decl) continue;
        const colon = decl.indexOf(":");
        if (colon <= 0) continue;
        const prop = decl.slice(0, colon).trim().toLowerCase();
        const value = decl
          .slice(colon + 1)
          .trim()
          .replace(/\s*!important\s*$/i, "");
        if (!prop || !value) continue;
        declarations.set(prop, value);
      }
      if (declarations.size === 0) continue;

      for (const selectorRaw of selectorText.split(",")) {
        const selector = selectorRaw.trim();
        if (!selector) continue;

        let targetMap: Map<string, ParsedCssRule[]> | null = null;
        let key = "";
        let specificity = 0;

        if (/^\.[A-Za-z_][\w-]*$/.test(selector)) {
          targetMap = stylesheet.classes;
          key = selector.slice(1);
          specificity = 10;
        } else if (/^#[A-Za-z_][\w-]*$/.test(selector)) {
          targetMap = stylesheet.ids;
          key = selector.slice(1);
          specificity = 100;
        } else if (/^[A-Za-z][\w-]*$/.test(selector)) {
          targetMap = stylesheet.tags;
          key = selector.toLowerCase();
          specificity = 1;
        } else {
          // Skip complex selectors for now to avoid accidental over-matching.
          continue;
        }

        const rules = targetMap.get(key) ?? [];
        rules.push({ declarations, specificity, order: order++ });
        targetMap.set(key, rules);
      }
    }
  }

  return stylesheet;
}

/** True when inline style explicitly declares a display property. */
function hasExplicitDisplay(el: Element): boolean {
  return /\bdisplay\s*:/.test(el.getAttribute("style") ?? "");
}

/** True when a <g> carries Inkscape's layer marker attribute. */
function hasInkscapeLayerMarker(el: Element): boolean {
  const ns = "http://www.inkscape.org/namespaces/inkscape";
  return (
    (el.getAttribute("inkscape:groupmode") ??
      el.getAttributeNS(ns, "groupmode")) === "layer"
  );
}

/** Detects logical layer groups in exported SVGs. */
export function isLayerGroup(el: Element): boolean {
  return hasExplicitDisplay(el) || hasInkscapeLayerMarker(el);
}

/** True when element is explicitly hidden via style or display attribute. */
export function isDisplayNone(
  el: Element,
  stylesheet?: SvgStylesheet,
): boolean {
  const display = resolveOwnProp(el, "display", stylesheet).toLowerCase();
  return display === "none";
}

/** Best-effort readable name for a layer group with sensible fallback. */
export function getLayerName(g: Element, index: number): string {
  const inkLabel =
    g.getAttribute("inkscape:label") ??
    g.getAttributeNS("http://www.inkscape.org/namespaces/inkscape", "label");
  if (inkLabel?.trim()) return inkLabel.trim();
  if (g.id) return g.id;
  const cls = g.getAttribute("class");
  if (cls?.trim()) return cls.trim();
  return `Layer ${index + 1}`;
}

/** Finds nearest ancestor layer id for a shape, if any. */
export function findContainingLayerId(
  el: Element,
  layerGroupIds: Set<string>,
): string | undefined {
  let cur = el.parentElement;
  while (cur && cur.tagName.toLowerCase() !== "svg") {
    if (cur.id && layerGroupIds.has(cur.id)) return cur.id;
    cur = cur.parentElement;
  }
  return undefined;
}

/** Extract one CSS declaration value from an inline style string. */
function getStyleDecl(style: string, property: string): string {
  for (const decl of style.split(";").filter(Boolean)) {
    const colon = decl.indexOf(":");
    if (colon !== -1 && decl.slice(0, colon).trim().toLowerCase() === property)
      return decl.slice(colon + 1).trim();
  }
  return "";
}

function getStylesheetDecl(
  el: Element,
  property: string,
  stylesheet?: SvgStylesheet,
): string {
  if (!stylesheet) return "";

  const candidates: ParsedCssRule[] = [];
  const classNames = (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const cls of classNames) {
    const rules = stylesheet.classes.get(cls);
    if (rules) candidates.push(...rules);
  }

  if (el.id) {
    const rules = stylesheet.ids.get(el.id);
    if (rules) candidates.push(...rules);
  }

  const tagRules = stylesheet.tags.get(el.tagName.toLowerCase());
  if (tagRules) candidates.push(...tagRules);

  let value = "";
  let bestSpecificity = -1;
  let bestOrder = -1;

  for (const rule of candidates) {
    const decl = rule.declarations.get(property);
    if (!decl) continue;
    if (
      rule.specificity > bestSpecificity ||
      (rule.specificity === bestSpecificity && rule.order > bestOrder)
    ) {
      value = decl;
      bestSpecificity = rule.specificity;
      bestOrder = rule.order;
    }
  }

  return value;
}

function resolveOwnProp(
  el: Element,
  property: string,
  stylesheet?: SvgStylesheet,
): string {
  const prop = property.toLowerCase();
  const style = el.getAttribute("style") ?? "";
  const styleVal = getStyleDecl(style, prop);
  if (styleVal && styleVal !== "inherit") return styleVal;

  const attrVal = el.getAttribute(prop) ?? "";
  if (attrVal && attrVal !== "inherit") return attrVal;

  const cssVal = getStylesheetDecl(el, prop, stylesheet);
  if (cssVal && cssVal !== "inherit") return cssVal;

  return "";
}

/** Resolves inherited SVG presentation properties up the ancestor chain. */
function resolveInheritedProp(
  el: Element,
  property: string,
  stylesheet?: SvgStylesheet,
): string {
  let current: Element | null = el;
  while (current && current.tagName.toLowerCase() !== "svg") {
    const own = resolveOwnProp(current, property, stylesheet);
    if (own) return own;
    current = current.parentElement;
  }
  return "";
}

/** Returns a visible effective fill color, or null when fill is not visible. */
export function getEffectiveFill(
  el: Element,
  stylesheet?: SvgStylesheet,
): string | null {
  // SVG default fill is black when fill is unspecified.
  const fill = resolveInheritedProp(el, "fill", stylesheet) || "black";
  if (fill === "none" || fill === "transparent" || fill.startsWith("url("))
    return null;

  const fillOpacityVal = resolveInheritedProp(el, "fill-opacity", stylesheet);
  const opacityVal = resolveInheritedProp(el, "opacity", stylesheet);
  if (
    (fillOpacityVal && parseFloat(fillOpacityVal) <= 0) ||
    (opacityVal && parseFloat(opacityVal) <= 0)
  )
    return null;
  return fill;
}

/** Returns a visible effective stroke color, or null when stroke is not visible. */
export function getEffectiveStrokeColor(
  el: Element,
  stylesheet?: SvgStylesheet,
): string | null {
  const stroke = resolveInheritedProp(el, "stroke", stylesheet);
  if (!stroke || stroke === "none" || stroke === "transparent") return null;

  const widthVal = resolveInheritedProp(el, "stroke-width", stylesheet);
  if (widthVal && parseFloat(widthVal) === 0) return null;

  const strokeOpacityVal = resolveInheritedProp(
    el,
    "stroke-opacity",
    stylesheet,
  );
  const opacityVal = resolveInheritedProp(el, "opacity", stylesheet);
  if (
    (strokeOpacityVal && parseFloat(strokeOpacityVal) <= 0) ||
    (opacityVal && parseFloat(opacityVal) <= 0)
  ) {
    return null;
  }

  return stroke;
}

/** True when a stroke is present and visible after inherited style resolution. */
export function hasVisibleStroke(
  el: Element,
  stylesheet?: SvgStylesheet,
): boolean {
  return getEffectiveStrokeColor(el, stylesheet) !== null;
}

/** Parses SVG length values into mm; returns null for unresolved percentages. */
export function parseSvgLengthMM(
  val: string | null | undefined,
): number | null {
  if (!val) return null;
  if (val.includes("%")) return null;
  const num = parseFloat(val);
  if (isNaN(num)) return null;
  if (val.endsWith("mm")) return num;
  if (val.endsWith("cm")) return num * 10;
  if (val.endsWith("in")) return num * 25.4;
  if (val.endsWith("pt")) return num * (25.4 / 72);
  if (val.endsWith("pc")) return num * (25.4 / 6);
  return num * (25.4 / 96);
}

/** Converts supported SVG shapes into equivalent path data. */
export function shapeToPathD(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const g = (attr: string) => parseFloat(el.getAttribute(attr) ?? "0");

  if (tag === "path") return el.getAttribute("d") ?? "";

  if (tag === "rect") {
    const x = g("x"),
      y = g("y"),
      w = g("width"),
      h = g("height");
    const rx = Math.min(g("rx") || g("ry"), w / 2);
    const ry = Math.min(g("ry") || g("rx"), h / 2);
    if (rx === 0 && ry === 0) {
      return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
    }
    return [
      `M${x + rx},${y}`,
      `H${x + w - rx}`,
      `A${rx},${ry},0,0,1,${x + w},${y + ry}`,
      `V${y + h - ry}`,
      `A${rx},${ry},0,0,1,${x + w - rx},${y + h}`,
      `H${x + rx}`,
      `A${rx},${ry},0,0,1,${x},${y + h - ry}`,
      `V${y + ry}`,
      `A${rx},${ry},0,0,1,${x + rx},${y}`,
      "Z",
    ].join(" ");
  }

  if (tag === "circle") {
    const cx = g("cx"),
      cy = g("cy"),
      r = g("r");
    return `M${cx - r},${cy} A${r},${r},0,0,1,${cx + r},${cy} A${r},${r},0,0,1,${cx - r},${cy} Z`;
  }

  if (tag === "ellipse") {
    const cx = g("cx"),
      cy = g("cy"),
      rx2 = g("rx"),
      ry2 = g("ry");
    return `M${cx - rx2},${cy} A${rx2},${ry2},0,0,1,${cx + rx2},${cy} A${rx2},${ry2},0,0,1,${cx - rx2},${cy} Z`;
  }

  if (tag === "line") {
    return `M${g("x1")},${g("y1")} L${g("x2")},${g("y2")}`;
  }

  if (tag === "polyline") {
    const pts = (el.getAttribute("points") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (pts.length < 2) return "";
    const cmds = [`M${pts[0]},${pts[1]}`];
    for (let i = 2; i < pts.length; i += 2)
      cmds.push(`L${pts[i]},${pts[i + 1]}`);
    return cmds.join(" ");
  }

  if (tag === "polygon") {
    const pts = (el.getAttribute("points") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (pts.length < 2) return "";
    const cmds = [`M${pts[0]},${pts[1]}`];
    for (let i = 2; i < pts.length; i += 2)
      cmds.push(`L${pts[i]},${pts[i + 1]}`);
    cmds.push("Z");
    return cmds.join(" ");
  }

  return "";
}
