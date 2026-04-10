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
import { PositionFieldsRow } from "./PositionFieldsRow";
import { StrokeWidthSection } from "./StrokeWidthSection";
import { TransformControlsSection } from "./TransformControlsSection";

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
  const {
    objW,
    objH,
    sharedTransformProps,
    onChangeX,
    onChangeY,
    onAlignX,
    onAlignY,
    onChangeScale,
    onChangeRotation,
  } = useImportPropertiesFormModel({
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
        onChangeX={onChangeX}
        onChangeY={onChangeY}
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
        onAlignX={onAlignX}
        onAlignY={onAlignY}
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

      <TransformControlsSection
        scale={imp.scale}
        rotation={imp.rotation}
        onChangeScale={onChangeScale}
        onChangeRotation={onChangeRotation}
        sharedTransformProps={sharedTransformProps}
      />

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
