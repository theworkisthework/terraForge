import type { SvgImport } from "../../../../../types";
import { computeImportPathBounds } from "../../../utils/svgTransform";

/**
 * Shrinks or grows an import's bounding box to fit its current paths, moving
 * x/y so the artwork stays where it is on the bed.
 *
 * The box is placed by its bottom-left corner (x, y) and rotates about its
 * centre, so when the box changes, the centre's offset in content space is
 * scaled and rotated the same way the canvas does it, then applied to x/y.
 * No-op when there are no paths or their bounds can't be measured.
 */
export function refitImportToPaths(imp: SvgImport): void {
  const bounds = computeImportPathBounds(imp.paths.map((p) => p.d));
  if (!bounds) return;

  const nextW = bounds.maxX - bounds.minX;
  const nextH = bounds.maxY - bounds.minY;
  if (!(nextW > 0) || !(nextH > 0)) return;

  const vbX = imp.viewBoxX ?? 0;
  const vbY = imp.viewBoxY ?? 0;
  const sX = imp.scaleX ?? imp.scale;
  const sY = imp.scaleY ?? imp.scale;

  // Centre shift in content units, then in mm with the canvas's y-down axes.
  const dx = (bounds.minX + nextW / 2 - (vbX + imp.svgWidth / 2)) * sX;
  const dy = (bounds.minY + nextH / 2 - (vbY + imp.svgHeight / 2)) * sY;
  const rad = ((imp.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const shiftX = dx * cos - dy * sin;
  const shiftDown = dx * sin + dy * cos;

  // Bed y points up, so a downward shift on screen lowers the centre.
  const centreX = imp.x + (imp.svgWidth * sX) / 2 + shiftX;
  const centreY = imp.y + (imp.svgHeight * sY) / 2 - shiftDown;

  imp.x = centreX - (nextW * sX) / 2;
  imp.y = centreY - (nextH * sY) / 2;
  imp.viewBoxX = bounds.minX;
  imp.viewBoxY = bounds.minY;
  imp.svgWidth = nextW;
  imp.svgHeight = nextH;
}
