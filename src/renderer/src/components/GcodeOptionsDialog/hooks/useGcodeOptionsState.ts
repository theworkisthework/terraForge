import React, { useMemo, useState } from "react";
import { useCanvasStore } from "../../../store/canvasStore";
import {
  loadGcodePrefs,
  saveGcodePrefs,
  type GcodePrefs,
} from "../../../features/gcode-options/gcodePrefs";
import {
  parseNonNegativeNumber,
  parsePositiveNumber,
} from "../../../features/gcode-options/gcodePrefsValidation";
import { buildLayerDipOptions } from "../utils/buildLayerDipOptions";

export type GcodeOptionsTab = "paths" | "options" | "ink" | "vinyl" | "output";

interface UseGcodeOptionsStateArgs {
  onCancel: () => void;
  onConfirm: (prefs: GcodePrefs) => void;
}

const SPLIT_KEYS = ["exportPerLayer", "exportPerGroup", "exportPerColor"] as const;

/**
 * Flips one boolean preference. The split-output modes are exclusive:
 * turning one on turns the others off, and per-colour hatch files stay on
 * only while per-colour export is.
 */
export function togglePref(prefs: GcodePrefs, key: keyof GcodePrefs): GcodePrefs {
  if (!(SPLIT_KEYS as readonly string[]).includes(key)) return { ...prefs, [key]: !prefs[key] };
  const next = !prefs[key];
  const split = Object.fromEntries(
    SPLIT_KEYS.map((splitKey) => [splitKey, splitKey === key ? next : next ? false : prefs[splitKey]]),
  );
  return {
    ...prefs,
    ...split,
    exportPerHatch: key === "exportPerColor" && next ? prefs.exportPerHatch : false,
  };
}

export function useGcodeOptionsState({
  onCancel,
  onConfirm,
}: UseGcodeOptionsStateArgs) {
  const imports = useCanvasStore((s) => s.imports);
  const layerDipOptions = useMemo(
    () => buildLayerDipOptions(imports),
    [imports],
  );
  const [prefs, setPrefs] = useState<GcodePrefs>(loadGcodePrefs);
  const [activeTab, setActiveTab] = useState<GcodeOptionsTab>("output");
  const [customGcodeOpen, setCustomGcodeOpen] = useState(false);

  const toggle = (key: keyof GcodePrefs) => setPrefs((currentPrefs) => togglePref(currentPrefs, key));

  const setTextField = (key: keyof GcodePrefs) => (value: string) =>
    setPrefs((currentPrefs) => ({ ...currentPrefs, [key]: value }));

  /** A setter for a numeric field typed as text: ignores input that does not
   * parse, so a half-typed value never replaces the last good one. */
  const numberField =
    <K extends keyof GcodePrefs>(key: K, parse: (value: string) => number | null, adjust = (n: number) => n) =>
    (value: string) => {
      const next = parse(value);
      if (next !== null) setPrefs((currentPrefs) => ({ ...currentPrefs, [key]: adjust(next) }));
    };
  const choice =
    <K extends keyof GcodePrefs>(key: K) =>
    (value: GcodePrefs[K]) =>
      setPrefs((currentPrefs) => ({ ...currentPrefs, [key]: value }));

  const setJoinTolerance = numberField("joinTolerance", parsePositiveNumber);
  const setClipOffsetMM = numberField("clipOffsetMM", parseNonNegativeNumber);
  const setClipMode = choice("clipMode");
  const setPathDirectionMode = choice("pathDirectionMode");
  const setPenDownDelayMs = numberField("penDownDelayMs", parseNonNegativeNumber);
  const setPenUpDelayMs = numberField("penUpDelayMs", parseNonNegativeNumber);
  const setDrawSpeedOverride = numberField("drawSpeedOverride", parsePositiveNumber);
  const setInkServiceMode = choice("inkServiceMode");
  const setInkServiceTriggerTravelMM = numberField("inkServiceTriggerTravelMM", parsePositiveNumber);
  const setInkServiceTriggerJitterPct = numberField("inkServiceTriggerJitterPct", parseNonNegativeNumber);
  const setInkServiceWashEveryNDips = numberField("inkServiceWashEveryNDips", parsePositiveNumber, Math.round);
  const setVinylWeedBorderMargin = numberField("vinylWeedBorderMarginMM", parseNonNegativeNumber);

  const setInkServiceLayerDipStation = (
    layerName: string,
    stationId: string,
  ) => {
    setPrefs((currentPrefs) => {
      const nextMap = { ...currentPrefs.inkServiceLayerDipMap };
      if (!stationId) {
        delete nextMap[layerName];
      } else {
        nextMap[layerName] = stationId;
      }
      return { ...currentPrefs, inkServiceLayerDipMap: nextMap };
    });
  };

  const neitherOutput = !prefs.uploadToSd && !prefs.saveLocally;

  const handleConfirm = () => {
    saveGcodePrefs(prefs);
    onConfirm(prefs);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") onCancel();
    if (event.key === "Enter" && !neitherOutput) handleConfirm();
  };

  return {
    activeTab,
    customGcodeOpen,
    layerDipOptions,
    neitherOutput,
    onKeyDown,
    prefs,
    setActiveTab,
    setClipMode,
    setClipOffsetMM,
    setCustomGcodeOpen,
    setDrawSpeedOverride,
    setInkServiceLayerDipStation,
    setInkServiceMode,
    setInkServiceTriggerJitterPct,
    setInkServiceTriggerTravelMM,
    setInkServiceWashEveryNDips,
    setJoinTolerance,
    setPathDirectionMode,
    setPenDownDelayMs,
    setPenUpDelayMs,
    setTextField,
    setVinylWeedBorderMargin,
    toggle,
    handleConfirm,
  };
}
