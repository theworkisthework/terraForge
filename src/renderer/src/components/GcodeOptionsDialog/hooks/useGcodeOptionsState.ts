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

  const toggle = (key: keyof GcodePrefs) =>
    setPrefs((currentPrefs) => {
      if (key === "exportPerGroup") {
        const next = !currentPrefs.exportPerGroup;
        return {
          ...currentPrefs,
          exportPerGroup: next,
          exportPerColor: next ? false : currentPrefs.exportPerColor,
        };
      }

      if (key === "exportPerColor") {
        const next = !currentPrefs.exportPerColor;
        return {
          ...currentPrefs,
          exportPerColor: next,
          exportPerGroup: next ? false : currentPrefs.exportPerGroup,
        };
      }

      return { ...currentPrefs, [key]: !currentPrefs[key] };
    });

  const setTextField = (key: keyof GcodePrefs) => (value: string) =>
    setPrefs((currentPrefs) => ({ ...currentPrefs, [key]: value }));

  const setJoinTolerance = (value: string) => {
    const next = parsePositiveNumber(value);
    if (next !== null) {
      setPrefs((currentPrefs) => ({ ...currentPrefs, joinTolerance: next }));
    }
  };

  const setClipOffsetMM = (value: string) => {
    const next = parseNonNegativeNumber(value);
    if (next !== null) {
      setPrefs((currentPrefs) => ({ ...currentPrefs, clipOffsetMM: next }));
    }
  };

  const setClipMode = (mode: GcodePrefs["clipMode"]) => {
    setPrefs((currentPrefs) => ({ ...currentPrefs, clipMode: mode }));
  };

  const setPathDirectionMode = (mode: GcodePrefs["pathDirectionMode"]) => {
    setPrefs((currentPrefs) => ({ ...currentPrefs, pathDirectionMode: mode }));
  };

  const setPenDownDelayMs = (value: string) => {
    const next = parseNonNegativeNumber(value);
    if (next !== null) {
      setPrefs((currentPrefs) => ({ ...currentPrefs, penDownDelayMs: next }));
    }
  };

  const setPenUpDelayMs = (value: string) => {
    const next = parseNonNegativeNumber(value);
    if (next !== null) {
      setPrefs((currentPrefs) => ({ ...currentPrefs, penUpDelayMs: next }));
    }
  };

  const setDrawSpeedOverride = (value: string) => {
    const next = parsePositiveNumber(value);
    if (next !== null) {
      setPrefs((currentPrefs) => ({
        ...currentPrefs,
        drawSpeedOverride: next,
      }));
    }
  };

  const setInkServiceMode = (mode: GcodePrefs["inkServiceMode"]) => {
    setPrefs((currentPrefs) => ({ ...currentPrefs, inkServiceMode: mode }));
  };

  const setInkServiceTriggerTravelMM = (value: string) => {
    const next = parsePositiveNumber(value);
    if (next !== null) {
      setPrefs((currentPrefs) => ({
        ...currentPrefs,
        inkServiceTriggerTravelMM: next,
      }));
    }
  };

  const setInkServiceTriggerJitterPct = (value: string) => {
    const next = parseNonNegativeNumber(value);
    if (next !== null) {
      setPrefs((currentPrefs) => ({
        ...currentPrefs,
        inkServiceTriggerJitterPct: next,
      }));
    }
  };

  const setInkServiceWashEveryNDips = (value: string) => {
    const next = parsePositiveNumber(value);
    if (next !== null) {
      setPrefs((currentPrefs) => ({
        ...currentPrefs,
        inkServiceWashEveryNDips: Math.round(next),
      }));
    }
  };

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

  const setVinylWeedBorderMargin = (value: string) => {
    const next = parseNonNegativeNumber(value);
    if (next !== null) {
      setPrefs((currentPrefs) => ({
        ...currentPrefs,
        vinylWeedBorderMarginMM: next,
      }));
    }
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
