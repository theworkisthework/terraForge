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
  ratioLocked: boolean;
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
  ratioLocked,
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
  const currentScaleX = imp.scaleX ?? imp.scale;
  const currentScaleY = imp.scaleY ?? imp.scale;
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
  const fitTargetW = useTemplateBounds
    ? templateScaleTarget === "margin"
      ? fitMarginW
      : pageW
    : bedW;
  const fitTargetH = useTemplateBounds
    ? templateScaleTarget === "margin"
      ? fitMarginH
      : pageH
    : bedH;
  const fitScale = useTemplateBounds
    ? templateScaleTarget === "margin"
      ? fitMarginScale
      : fitPageScale
    : fitBedScale;
  const fitScaleX = fitTargetW / (imp.svgWidth || 1);
  const fitScaleY = fitTargetH / (imp.svgHeight || 1);
  const snapPresetTitle = `Snap to next preset (${ROT_PRESETS.join("° · ")}°)`;

  const sharedTransformProps = {
    fitScale,
    fitScaleX,
    fitScaleY,
    rotStep,
    rotSteps: ROT_STEPS,
    stepFlyoutOpen,
    showCentreMarker,
    ratioLocked,
    snapPresetTitle,
    canScaleToTemplate,
    templateScaleEnabled,
    templateScaleTarget,
    onTemplateScaleEnabledChange,
    onTemplateScaleTargetChange,
    onFitToBed: () => {
      if (ratioLocked) {
        const keepPosition = useTemplateBounds;
        onUpdate({
          scale: fitScale,
          scaleX: undefined,
          scaleY: undefined,
          ...(keepPosition ? {} : { x: 0, y: 0 }),
        });
        return;
      }

      const fitFactor = Math.min(
        fitTargetW / ((imp.svgWidth || 1) * currentScaleX),
        fitTargetH / ((imp.svgHeight || 1) * currentScaleY),
      );

      onUpdate({
        scaleX: Math.max(0.001, currentScaleX * fitFactor),
        scaleY: Math.max(0.001, currentScaleY * fitFactor),
        ...(useTemplateBounds ? {} : { x: 0, y: 0 }),
      });
    },
    onFitHorizontal: () => {
      if (ratioLocked) return;
      onUpdate({ scaleX: Math.max(0.001, fitScaleX) });
    },
    onFitVertical: () => {
      if (ratioLocked) return;
      onUpdate({ scaleY: Math.max(0.001, fitScaleY) });
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
