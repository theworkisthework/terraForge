import type { SvgImport } from "../../../../../types";
import { ROT_PRESETS, ROT_STEPS, type RotStep } from "../utils/rotation";

interface UseImportPropertiesFormModelArgs {
  imp: SvgImport;
  bedW: number;
  bedH: number;
  pageW: number;
  pageH: number;
  marginMM: number;
  canScaleToTemplate: boolean;
  templateScaleEnabled: boolean;
  templateScaleTarget: "page" | "margin";
  rotStep: RotStep;
  stepFlyoutOpen: boolean;
  showCentreMarker: boolean;
  onUpdate: (changes: Partial<SvgImport>) => void;
  onRatioLockedChange: (v: boolean) => void;
  onTemplateScaleEnabledChange: (v: boolean) => void;
  onTemplateScaleTargetChange: (v: "page" | "margin") => void;
  onToggleStepFlyout: () => void;
  onCloseStepFlyout: () => void;
  onSelectRotStep: (s: RotStep) => void;
  onToggleCentreMarker: () => void;
}

export function useImportPropertiesFormModel({
  imp,
  bedW,
  bedH,
  pageW,
  pageH,
  marginMM,
  canScaleToTemplate,
  templateScaleEnabled,
  templateScaleTarget,
  rotStep,
  stepFlyoutOpen,
  showCentreMarker,
  onUpdate,
  onRatioLockedChange,
  onTemplateScaleEnabledChange,
  onTemplateScaleTargetChange,
  onToggleStepFlyout,
  onCloseStepFlyout,
  onSelectRotStep,
  onToggleCentreMarker,
}: UseImportPropertiesFormModelArgs) {
  const objW = imp.svgWidth * (imp.scaleX ?? imp.scale);
  const objH = imp.svgHeight * (imp.scaleY ?? imp.scale);
  const fitBedScale = Math.min(
    bedW / (imp.svgWidth || 1),
    bedH / (imp.svgHeight || 1),
  );
  const fitPageScale = Math.min(
    pageW / (imp.svgWidth || 1),
    pageH / (imp.svgHeight || 1),
  );
  const fitMarginW = Math.max(0, pageW - 2 * marginMM);
  const fitMarginH = Math.max(0, pageH - 2 * marginMM);
  const fitMarginScale = Math.min(
    fitMarginW / (imp.svgWidth || 1),
    fitMarginH / (imp.svgHeight || 1),
  );
  const useTemplateBounds = templateScaleEnabled && canScaleToTemplate;
  const fitScale = useTemplateBounds
    ? templateScaleTarget === "margin"
      ? fitMarginScale
      : fitPageScale
    : fitBedScale;
  const snapPresetTitle = `Snap to next preset (${ROT_PRESETS.join("° · ")}°)`;

  const sharedTransformProps = {
    fitScale,
    rotStep,
    rotSteps: ROT_STEPS,
    stepFlyoutOpen,
    showCentreMarker,
    snapPresetTitle,
    canScaleToTemplate,
    templateScaleEnabled,
    templateScaleTarget,
    onTemplateScaleEnabledChange,
    onTemplateScaleTargetChange,
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

  const onChangeX = (v: number) => onUpdate({ x: v });
  const onChangeY = (v: number) => onUpdate({ y: v });
  const onAlignX = (x: number) => onUpdate({ x: Math.round(x * 1000) / 1000 });
  const onAlignY = (y: number) => onUpdate({ y: Math.round(y * 1000) / 1000 });
  const onChangeScale = (v: number) => onUpdate({ scale: Math.max(0.001, v) });
  const onChangeRotation = (v: number) => onUpdate({ rotation: v });

  return {
    objW,
    objH,
    sharedTransformProps,
    onChangeX,
    onChangeY,
    onAlignX,
    onAlignY,
    onChangeScale,
    onChangeRotation,
  };
}
