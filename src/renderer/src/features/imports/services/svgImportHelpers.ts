// SVG import helper functions extracted from Toolbar.

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
export function isDisplayNone(el: Element): boolean {
  const styleHidden = /display\s*:\s*none/.test(el.getAttribute("style") ?? "");
  const attrHidden =
    (el.getAttribute("display") ?? "").trim().toLowerCase() === "none";
  return styleHidden || attrHidden;
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
    if (colon !== -1 && decl.slice(0, colon).trim() === property)
      return decl.slice(colon + 1).trim();
  }
  return "";
}

/** Resolves inherited SVG presentation properties up the ancestor chain. */
function resolveInheritedProp(el: Element, property: string): string {
  let current: Element | null = el;
  while (current && current.tagName.toLowerCase() !== "svg") {
    const style = current.getAttribute("style") ?? "";
    const styleVal = getStyleDecl(style, property);
    if (styleVal && styleVal !== "inherit") return styleVal;
    const attrVal = current.getAttribute(property) ?? "";
    if (attrVal && attrVal !== "inherit") return attrVal;
    current = current.parentElement;
  }
  return "";
}

/** Returns a visible effective fill color, or null when fill is not visible. */
export function getEffectiveFill(el: Element): string | null {
  const fill = resolveInheritedProp(el, "fill");
  if (
    !fill ||
    fill === "none" ||
    fill === "transparent" ||
    fill.startsWith("url(")
  )
    return null;

  const fillOpacityVal = resolveInheritedProp(el, "fill-opacity");
  const opacityVal = resolveInheritedProp(el, "opacity");
  if (
    (fillOpacityVal && parseFloat(fillOpacityVal) <= 0) ||
    (opacityVal && parseFloat(opacityVal) <= 0)
  )
    return null;
  return fill;
}

/** True when a stroke is present and visible after inherited style resolution. */
export function hasVisibleStroke(el: Element): boolean {
  const stroke = resolveInheritedProp(el, "stroke");
  if (!stroke || stroke === "none" || stroke === "transparent") return false;

  const widthVal = resolveInheritedProp(el, "stroke-width");
  if (widthVal && parseFloat(widthVal) === 0) return false;

  const strokeOpacityVal = resolveInheritedProp(el, "stroke-opacity");
  const opacityVal = resolveInheritedProp(el, "opacity");
  if (
    (strokeOpacityVal && parseFloat(strokeOpacityVal) <= 0) ||
    (opacityVal && parseFloat(opacityVal) <= 0)
  )
    return false;
  return true;
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
