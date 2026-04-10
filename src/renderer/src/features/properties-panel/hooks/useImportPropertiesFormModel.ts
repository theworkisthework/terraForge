import type { SvgImport } from "../../../../../types";
import { ROT_PRESETS, ROT_STEPS, type RotStep } from "../utils/rotation";

interface UseImportPropertiesFormModelArgs {
  imp: SvgImport;
  bedW: number;
  bedH: number;
  rotStep: RotStep;
  stepFlyoutOpen: boolean;
  showCentreMarker: boolean;
  onUpdate: (changes: Partial<SvgImport>) => void;
  onRatioLockedChange: (v: boolean) => void;
  onToggleStepFlyout: () => void;
  onCloseStepFlyout: () => void;
  onSelectRotStep: (s: RotStep) => void;
  onToggleCentreMarker: () => void;
}

export function useImportPropertiesFormModel({
  imp,
  bedW,
  bedH,
  rotStep,
  stepFlyoutOpen,
  showCentreMarker,
  onUpdate,
  onRatioLockedChange,
  onToggleStepFlyout,
  onCloseStepFlyout,
  onSelectRotStep,
  onToggleCentreMarker,
}: UseImportPropertiesFormModelArgs) {
  const objW = imp.svgWidth * (imp.scaleX ?? imp.scale);
  const objH = imp.svgHeight * (imp.scaleY ?? imp.scale);
  const fitScale = Math.min(
    bedW / (imp.svgWidth || 1),
    bedH / (imp.svgHeight || 1),
  );
  const snapPresetTitle = `Snap to next preset (${ROT_PRESETS.join("° · ")}°)`;

  const sharedTransformProps = {
    fitScale,
    rotStep,
    rotSteps: ROT_STEPS,
    stepFlyoutOpen,
    showCentreMarker,
    snapPresetTitle,
    onFitToBed: () => {
      onRatioLockedChange(true);
      onUpdate({
        scale: fitScale,
        scaleX: undefined,
        scaleY: undefined,
        x: 0,
        y: 0,
      });
    },
    onResetScale: () => {
      onRatioLockedChange(true);
      onUpdate({ scale: 1, scaleX: undefined, scaleY: undefined });
    },
    onRotateCcw: () => onUpdate({ rotation: imp.rotation - rotStep }),
    onRotateCw: () => onUpdate({ rotation: imp.rotation + rotStep }),
    onToggleStepFlyout,
    onCloseStepFlyout,
    onSelectRotStep,
    onToggleCentreMarker,
    onSnapToNextPreset: () => {
      const norm = ((imp.rotation % 360) + 360) % 360;
      const idx = ROT_PRESETS.findIndex((p) => Math.abs(p - norm) < 1);
      const next = ROT_PRESETS[idx < 0 ? 0 : (idx + 1) % ROT_PRESETS.length];
      onUpdate({ rotation: next });
    },
  };

  return {
    objW,
    objH,
    sharedTransformProps,
  };
}
