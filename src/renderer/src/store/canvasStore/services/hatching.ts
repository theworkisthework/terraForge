import {
  DEFAULT_HATCH_ANGLE_DEG,
  DEFAULT_HATCH_SPACING_MM,
  type SvgImport,
} from "../../../../../types";
import { generateHatchPaths } from "../../../utils/hatchFill";

export function getEffectiveImportScale(imp: SvgImport): number {
  return Math.sqrt((imp.scaleX ?? imp.scale) * (imp.scaleY ?? imp.scale));
}

export function regenerateImportHatching(imp: SvgImport): void {
  const effectiveScale = getEffectiveImportScale(imp);
  const spacingMM = imp.hatchSpacingMM ?? DEFAULT_HATCH_SPACING_MM;
  const angleDeg = imp.hatchAngleDeg ?? DEFAULT_HATCH_ANGLE_DEG;

  if (
    !imp.hatchEnabled ||
    effectiveScale <= 0 ||
    !Number.isFinite(effectiveScale) ||
    spacingMM <= 0 ||
    !Number.isFinite(angleDeg)
  ) {
    return;
  }

  const spacingUnits = spacingMM / effectiveScale;
  for (const path of imp.paths) {
    if (!path.hasFill) {
      path.hatchLines = undefined;
      continue;
    }
    const lines = generateHatchPaths(path.d, spacingUnits, angleDeg);
    path.hatchLines = lines.length ? lines : undefined;
  }
}

export function applyImportHatch(
  imp: SvgImport,
  spacingMM: number,
  angleDeg: number,
  enabled: boolean,
): void {
  const safeSpacing =
    Number.isFinite(spacingMM) && spacingMM > 0
      ? spacingMM
      : imp.hatchSpacingMM;
  const safeAngle = Number.isFinite(angleDeg) ? angleDeg : imp.hatchAngleDeg;

  imp.hatchEnabled = enabled;
  imp.hatchSpacingMM = safeSpacing;
  imp.hatchAngleDeg = safeAngle;

  const effectiveScale = getEffectiveImportScale(imp);
  const spacingIsValid =
    Number.isFinite(safeSpacing) &&
    safeSpacing > 0 &&
    Number.isFinite(safeAngle) &&
    effectiveScale > 0 &&
    Number.isFinite(effectiveScale) &&
    enabled;

  if (!spacingIsValid) {
    for (const path of imp.paths) {
      path.hatchLines = undefined;
    }
    return;
  }

  const spacingUnits = safeSpacing / effectiveScale;
  for (const path of imp.paths) {
    if (!path.hasFill) {
      path.hatchLines = undefined;
      continue;
    }
    const lines = generateHatchPaths(path.d, spacingUnits, safeAngle);
    path.hatchLines = lines.length ? lines : undefined;
  }
}
