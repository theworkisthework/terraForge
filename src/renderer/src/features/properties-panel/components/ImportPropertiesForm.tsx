import {
  DEFAULT_HATCH_ANGLE_DEG,
  DEFAULT_HATCH_SPACING_MM,
  DEFAULT_STROKE_WIDTH_MM,
} from "../../../../../types";
import { useImportPropertiesFormModel } from "../hooks/useImportPropertiesFormModel";
import type { ImportPropertiesFormProps } from "./ImportPropertiesForm.types";
import { AlignmentDimensionsSection } from "./AlignmentDimensionsSection";
import { HatchFillSection } from "./HatchFillSection";
import { PositionFieldsRow } from "./PositionFieldsRow";
import { StrokeWidthSection } from "./StrokeWidthSection";
import { TransformControlsSection } from "./TransformControlsSection";

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
  templateScaleEnabled,
  templateScaleTarget,
  ratioLocked,
  rotStep,
  stepFlyoutOpen,
  showCentreMarker,
  onUpdate,
  onTemplateAlignEnabledChange,
  onTemplateAlignTargetChange,
  onTemplateScaleEnabledChange,
  onTemplateScaleTargetChange,
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
    pageW,
    pageH,
    marginMM,
    canScaleToTemplate: canAlignToTemplate,
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

      <AlignmentDimensionsSection
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
