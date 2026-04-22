import { useMemo } from "react";
import { SvgImport, SvgPath } from "../../../types";
import {
  normalizeSvgColor,
  parseColorToRgb,
} from "../../imports/services/svgImportHelpers";

const GENERATED_STROKE_GROUP_COLOR = normalizeSvgColor("black");

/** Represents a group of paths that share the same effective source color */
export interface ColorGroupPathRef {
  pathId: string;
  includesFill: boolean;
  includesStroke: boolean;
}

export interface ColorGroup {
  /** CSS color value (e.g. '#FF0000', 'black', 'rgb(255,0,0)') */
  color: string;
  /** All path memberships in this color group */
  paths: ColorGroupPathRef[];
  /** Number of paths in this group */
  count: number;
}

/**
 * Converts RGB to HSL hue value (0-360).
 * Used for sorting colors by hue (rainbow order).
 */
function rgbToHue(r: number, g: number, b: number): number {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta === 0) {
    hue = 0; // Grayscale
  } else if (max === r) {
    hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    hue = ((b - r) / delta + 2) / 6;
  } else {
    hue = ((r - g) / delta + 4) / 6;
  }

  return hue * 360;
}

/**
 * Pure function that computes color groups from paths.
 * Groups paths by fill and stroke colors independently, with legacy fallbacks.
 * Generated outlines for no-stroke paths join the black stroke group by default.
 * Exported for testability.
 */
export function computeColorGroups(
  paths: SvgPath[],
  generatedStrokeForNoStroke = false,
): ColorGroup[] {
  const colorMap = new Map<string, ColorGroupPathRef[]>();

  for (const path of paths) {
    const sourceOutlineVisible =
      typeof path.sourceOutlineVisible === "boolean"
        ? path.sourceOutlineVisible
        : path.outlineVisible !== false;
    const generatedStrokeEnabled =
      path.generatedStrokeEnabled ?? generatedStrokeForNoStroke;
    const rawFillColor =
      path.fillColor ?? (path.hasFill ? path.sourceColor : undefined);
    const rawStrokeColor =
      path.strokeColor ??
      (sourceOutlineVisible
        ? !path.hasFill
          ? path.sourceColor
          : undefined
        : generatedStrokeEnabled
          ? GENERATED_STROKE_GROUP_COLOR
          : undefined);

    const memberships = new Map<string, ColorGroupPathRef>();

    const fillColor = rawFillColor
      ? normalizeSvgColor(rawFillColor)
      : undefined;
    if (fillColor) {
      memberships.set(fillColor, {
        pathId: path.id,
        includesFill: true,
        includesStroke: false,
      });
    }

    const strokeColor = rawStrokeColor
      ? normalizeSvgColor(rawStrokeColor)
      : undefined;
    if (strokeColor) {
      const existing = memberships.get(strokeColor);
      if (existing) {
        existing.includesStroke = true;
      } else {
        memberships.set(strokeColor, {
          pathId: path.id,
          includesFill: false,
          includesStroke: true,
        });
      }
    }

    for (const [color, ref] of memberships) {
      const refs = colorMap.get(color) || [];
      refs.push(ref);
      colorMap.set(color, refs);
    }
  }

  // Convert to ColorGroup array and sort by hue (rainbow order)
  const groups: ColorGroup[] = Array.from(colorMap.entries()).map(
    ([color, groupPaths]) => ({
      color,
      paths: groupPaths,
      count: groupPaths.length,
    }),
  );

  // Sort by hue for rainbow-order display
  groups.sort((a, b) => {
    const aRgb = parseColorToRgb(a.color);
    const bRgb = parseColorToRgb(b.color);

    if (!aRgb && !bRgb) return 0;
    if (!aRgb) return 1; // Unparseable colors go to end
    if (!bRgb) return -1;

    const aHue = rgbToHue(aRgb[0], aRgb[1], aRgb[2]);
    const bHue = rgbToHue(bRgb[0], bRgb[1], bRgb[2]);

    return aHue - bHue;
  });

  return groups;
}

/**
 * React hook that computes color groups from an import.
 * Memoized to prevent unnecessary recomputation.
 */
export function useColorGroups(imp: SvgImport): ColorGroup[] {
  return useMemo(
    () =>
      computeColorGroups(imp.paths, imp.generatedStrokeForNoStroke ?? false),
    [imp.generatedStrokeForNoStroke, imp.paths],
  );
}
