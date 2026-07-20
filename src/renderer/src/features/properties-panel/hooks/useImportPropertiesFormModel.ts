import type { SvgImport } from "../../../../../types";
import { ROT_PRESETS, ROT_STEPS, type RotStep } from "../utils/rotation";

interface UseImportPropertiesFormModelArgs {
  imp: SvgImport;
  bedW: number;
  bedH: number;
  origin: "bottom-left" | "top-left" | "bottom-right" | "top-right" | "center";
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
  origin,
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
  const isRightOrigin = origin === "bottom-right" || origin === "top-right";
  const isTopOrigin = origin === "top-left" || origin === "top-right";
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

  const computeOriginAnchoredPosition = (
    nextObjW: number,
    nextObjH: number,
  ) => {
    if (useTemplateBounds) return {};
    return {
      x: isRightOrigin ? bedW - nextObjW : 0,
      y: isTopOrigin ? -nextObjH : 0,
    };
  };

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
        const nextObjW = (imp.svgWidth || 0) * fitScale;
        const nextObjH = (imp.svgHeight || 0) * fitScale;
        onUpdate({
          scale: fitScale,
          scaleX: undefined,
          scaleY: undefined,
          ...computeOriginAnchoredPosition(nextObjW, nextObjH),
        });
        return;
      }

      const fitFactor = Math.min(
        fitTargetW / ((imp.svgWidth || 1) * currentScaleX),
        fitTargetH / ((imp.svgHeight || 1) * currentScaleY),
      );

      const nextScaleX = Math.max(0.001, currentScaleX * fitFactor);
      const nextScaleY = Math.max(0.001, currentScaleY * fitFactor);
      const nextObjW = (imp.svgWidth || 0) * nextScaleX;
      const nextObjH = (imp.svgHeight || 0) * nextScaleY;

      onUpdate({
        scaleX: nextScaleX,
        scaleY: nextScaleY,
        ...computeOriginAnchoredPosition(nextObjW, nextObjH),
      });
    },
    onFitHorizontal: () => {
      if (ratioLocked) return;
      const nextScaleX = Math.max(0.001, fitScaleX);
      const nextObjW = (imp.svgWidth || 0) * nextScaleX;
      onUpdate({
        scaleX: nextScaleX,
        ...(useTemplateBounds
          ? {}
          : { x: isRightOrigin ? bedW - nextObjW : 0 }),
      });
    },
    onFitVertical: () => {
      if (ratioLocked) return;
      const nextScaleY = Math.max(0.001, fitScaleY);
      const nextObjH = (imp.svgHeight || 0) * nextScaleY;
      onUpdate({
        scaleY: nextScaleY,
        ...(useTemplateBounds ? {} : { y: isTopOrigin ? -nextObjH : 0 }),
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
