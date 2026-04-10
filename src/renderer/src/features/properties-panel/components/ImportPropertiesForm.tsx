import type { SvgImport } from "../../../../../types";
import {
  DEFAULT_HATCH_ANGLE_DEG,
  DEFAULT_HATCH_SPACING_MM,
  DEFAULT_STROKE_WIDTH_MM,
} from "../../../../../types";
import type { RotStep } from "../utils/rotation";
import { useImportPropertiesFormModel } from "../hooks/useImportPropertiesFormModel";
import { AlignmentControls } from "./AlignmentControls";
import { DimensionsRow } from "./DimensionsRow";
import { HatchFillSection } from "./HatchFillSection";
import { NumberField } from "./NumberField";
import { PositionFieldsRow } from "./PositionFieldsRow";
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
  const { objW, objH, sharedTransformProps } = useImportPropertiesFormModel({
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
  });

  return (
    <>
      {/* X / Y — two columns (unconstrained: G-code clips to bed) */}
      <PositionFieldsRow
        x={imp.x}
        y={imp.y}
        onChangeX={(v) => onUpdate({ x: v })}
        onChangeY={(v) => onUpdate({ y: v })}
      />

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
