import type { SvgImport } from "../../../../../types";
import {
  DEFAULT_HATCH_ANGLE_DEG,
  DEFAULT_HATCH_SPACING_MM,
  DEFAULT_STROKE_WIDTH_MM,
} from "../../../../../types";
import { ROT_PRESETS, ROT_STEPS, type RotStep } from "../utils/rotation";
import { AlignmentControls } from "./AlignmentControls";
import { DimensionsRow } from "./DimensionsRow";
import { HatchFillSection } from "./HatchFillSection";
import { NumberField } from "./NumberField";
import { StrokeWidthSection } from "./StrokeWidthSection";
import { TransformShortcuts } from "./TransformShortcuts";

interface ImportPropertiesFormProps {
  imp: SvgImport;
  bedW: number;
  bedH: number;
  pageW: number;
  pageH: number;
  marginMM: number;
  canAlignToTemplate: boolean;
  templateAlignEnabled: boolean;
  templateAlignTarget: "page" | "margin";
  ratioLocked: boolean;
  rotStep: RotStep;
  stepFlyoutOpen: boolean;
  showCentreMarker: boolean;
  onUpdate: (changes: Partial<SvgImport>) => void;
  onTemplateAlignEnabledChange: (v: boolean) => void;
  onTemplateAlignTargetChange: (v: "page" | "margin") => void;
  onRatioLockedChange: (v: boolean) => void;
  onToggleStepFlyout: () => void;
  onCloseStepFlyout: () => void;
  onSelectRotStep: (s: RotStep) => void;
  onToggleCentreMarker: () => void;
  onChangeStrokeWidth: (value: number) => void;
  onApplyHatch: (
    importId: string,
    spacingMM: number,
    angleDeg: number,
    enabled: boolean,
  ) => void;
}

export function ImportPropertiesForm({
  imp,
  bedW,
  bedH,
  pageW,
  pageH,
  marginMM,
  canAlignToTemplate,
  templateAlignEnabled,
  templateAlignTarget,
  ratioLocked,
  rotStep,
  stepFlyoutOpen,
  showCentreMarker,
  onUpdate,
  onTemplateAlignEnabledChange,
  onTemplateAlignTargetChange,
  onRatioLockedChange,
  onToggleStepFlyout,
  onCloseStepFlyout,
  onSelectRotStep,
  onToggleCentreMarker,
  onChangeStrokeWidth,
  onApplyHatch,
}: ImportPropertiesFormProps) {
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

  return (
    <>
      {/* X / Y — two columns (unconstrained: G-code clips to bed) */}
      <div className="grid grid-cols-2 gap-2 mb-0">
        <NumberField
          label="X (mm)"
          value={imp.x}
          onChange={(v) => onUpdate({ x: v })}
          step={0.5}
        />
        <NumberField
          label="Y (mm)"
          value={imp.y}
          onChange={(v) => onUpdate({ y: v })}
          step={0.5}
        />
      </div>

      <AlignmentControls
        objW={objW}
        objH={objH}
        bedW={bedW}
        bedH={bedH}
        pageW={pageW}
        pageH={pageH}
        marginMM={marginMM}
        canAlignToTemplate={canAlignToTemplate}
        templateAlignEnabled={templateAlignEnabled}
        templateAlignTarget={templateAlignTarget}
        onTemplateAlignEnabledChange={onTemplateAlignEnabledChange}
        onTemplateAlignTargetChange={onTemplateAlignTargetChange}
        onAlignX={(x) => onUpdate({ x: Math.round(x * 1000) / 1000 })}
        onAlignY={(y) => onUpdate({ y: Math.round(y * 1000) / 1000 })}
      />

      <DimensionsRow
        objW={objW}
        objH={objH}
        svgWidth={imp.svgWidth}
        svgHeight={imp.svgHeight}
        ratioLocked={ratioLocked}
        currentScaleX={imp.scaleX ?? imp.scale}
        currentScaleY={imp.scaleY ?? imp.scale}
        onUpdate={onUpdate}
        onRatioLockedChange={onRatioLockedChange}
      />

      {/* Scale — full width */}
      <NumberField
        label="Scale"
        value={imp.scale}
        onChange={(v) => onUpdate({ scale: Math.max(0.001, v) })}
        step={0.05}
        min={0.001}
      />

      <TransformShortcuts {...sharedTransformProps} showRotationRow={false} />

      {/* Rotation — full width */}
      <NumberField
        label="Rotation (°)"
        value={imp.rotation}
        onChange={(v) => onUpdate({ rotation: v })}
        step={1}
      />

      <TransformShortcuts {...sharedTransformProps} showScaleRow={false} />

      <StrokeWidthSection
        strokeWidthMM={imp.strokeWidthMM}
        defaultStrokeWidthMM={DEFAULT_STROKE_WIDTH_MM}
        onChangeStrokeWidth={onChangeStrokeWidth}
      />

      <HatchFillSection
        imp={imp}
        defaultSpacingMM={DEFAULT_HATCH_SPACING_MM}
        defaultAngleDeg={DEFAULT_HATCH_ANGLE_DEG}
        onApplyHatch={onApplyHatch}
      />
    </>
  );
}
