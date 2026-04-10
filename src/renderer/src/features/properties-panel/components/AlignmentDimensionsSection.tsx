import { AlignmentControls } from "./AlignmentControls";
import { DimensionsRow } from "./DimensionsRow";

interface AlignmentDimensionsSectionProps {
  objW: number;
  objH: number;
  bedW: number;
  bedH: number;
  pageW: number;
  pageH: number;
  marginMM: number;
  canAlignToTemplate: boolean;
  templateAlignEnabled: boolean;
  templateAlignTarget: "page" | "margin";
  onTemplateAlignEnabledChange: (v: boolean) => void;
  onTemplateAlignTargetChange: (v: "page" | "margin") => void;
  onAlignX: (x: number) => void;
  onAlignY: (y: number) => void;
  svgWidth: number;
  svgHeight: number;
  ratioLocked: boolean;
  currentScaleX: number;
  currentScaleY: number;
  onUpdate: (changes: {
    scale?: number;
    scaleX?: number;
    scaleY?: number;
  }) => void;
  onRatioLockedChange: (v: boolean) => void;
}

export function AlignmentDimensionsSection({
  objW,
  objH,
  bedW,
  bedH,
  pageW,
  pageH,
  marginMM,
  canAlignToTemplate,
  templateAlignEnabled,
  templateAlignTarget,
  onTemplateAlignEnabledChange,
  onTemplateAlignTargetChange,
  onAlignX,
  onAlignY,
  svgWidth,
  svgHeight,
  ratioLocked,
  currentScaleX,
  currentScaleY,
  onUpdate,
  onRatioLockedChange,
}: AlignmentDimensionsSectionProps) {
  return (
    <>
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
        svgWidth={svgWidth}
        svgHeight={svgHeight}
        ratioLocked={ratioLocked}
        currentScaleX={currentScaleX}
        currentScaleY={currentScaleY}
        onUpdate={onUpdate}
        onRatioLockedChange={onRatioLockedChange}
      />
    </>
  );
}
