/**
 * The G-code worker's options, from the user's generation preferences and
 * what the app knows: versions, the page template, vinyl and ink settings.
 */
import type { GcodeOptions, InkServiceStation, PageSize, PageTemplate } from "../../../../../types";
import type { GcodePrefs } from "../../gcode-options/gcodePrefs";

export interface GcodeOptionsContext {
  terraForgeVersion: string;
  firmwareVersion: string;
  pageTemplate: PageTemplate | null;
  pageSizes: PageSize[];
  /** Drag-knife settings, or null when vinyl cutting is off for the app. */
  vinyl: { bladeOffsetMM: number; cornerAngleThresholdDeg: number; microJogMagnitudeMM: number } | null;
  inkServiceStations: InkServiceStation[];
}

/** Clipping to the page (less its margin) or to the page edge (less a
 * safety inset), when a page is shown and clipping is on. */
function pageClipFor(prefs: GcodePrefs, pageTemplate: PageTemplate | null, pageSizes: PageSize[]) {
  const size = pageTemplate ? pageSizes.find((ps) => ps.id === pageTemplate.sizeId) : undefined;
  if (!pageTemplate || !size || prefs.clipMode === "none") return undefined;
  return {
    widthMM: pageTemplate.landscape ? size.heightMM : size.widthMM,
    heightMM: pageTemplate.landscape ? size.widthMM : size.heightMM,
    marginMM: prefs.clipMode === "margin" ? (pageTemplate.marginMM ?? 20) : (prefs.clipOffsetMM ?? 0),
  };
}

export function buildGcodeOptions(prefs: GcodePrefs, ctx: GcodeOptionsContext): GcodeOptions {
  return {
    terraForgeVersion: ctx.terraForgeVersion,
    firmwareVersion: ctx.firmwareVersion,
    arcFitting: false,
    arcTolerance: 0.01,
    optimisePaths: prefs.optimise,
    pathDirectionMode: prefs.pathDirectionMode,
    joinPaths: prefs.joinPaths,
    joinTolerance: prefs.joinTolerance,
    liftPenAtEnd: prefs.liftPenAtEnd,
    returnToHome: prefs.returnToHome,
    penDownDelayMsOverride: prefs.penDownDelayOverrideEnabled ? prefs.penDownDelayMs : undefined,
    penUpDelayMsOverride: prefs.penUpDelayOverrideEnabled ? prefs.penUpDelayMs : undefined,
    drawSpeedOverride: prefs.drawSpeedOverrideEnabled ? prefs.drawSpeedOverride : undefined,
    customStartGcode: prefs.customStartGcode,
    customEndGcode: prefs.customEndGcode,
    pageClip: pageClipFor(prefs, ctx.pageTemplate, ctx.pageSizes),
    vinylCutting: ctx.vinyl && prefs.generateVinylCuttingGcode ? { ...ctx.vinyl } : undefined,
    vinylWeedBorder: prefs.generateVinylWeedBorderGcode ? { marginMM: prefs.vinylWeedBorderMarginMM } : undefined,
    inkService: prefs.inkServiceEnabled
      ? {
          mode: prefs.inkServiceMode,
          triggerTravelMM: prefs.inkServiceTriggerTravelMM,
          triggerJitterPct: prefs.inkServiceTriggerJitterPct,
          stations: ctx.inkServiceStations,
          randomizeDipStation: prefs.inkServiceRandomizeDipStation,
          includeWashMove: prefs.inkServiceIncludeWashMove,
          washEveryNDips: prefs.inkServiceWashEveryNDips,
          layerDipStations: prefs.inkServiceLayerDipMap,
        }
      : undefined,
  };
}
