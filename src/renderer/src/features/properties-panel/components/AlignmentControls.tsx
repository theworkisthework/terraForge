import { useAlignmentControlsModel } from "../hooks/useAlignmentControlsModel";
import { AlignmentButtonsRow } from "./AlignmentButtonsRow";

interface AlignmentControlsProps {
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
  onTemplateAlignEnabledChange: (enabled: boolean) => void;
  onTemplateAlignTargetChange: (target: "page" | "margin") => void;
  onAlignX: (x: number) => void;
  onAlignY: (y: number) => void;
}

export function AlignmentControls({
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
}: AlignmentControlsProps) {
  const {
    leftTitle,
    centerHTitle,
    rightTitle,
    topTitle,
    centerVTitle,
    bottomTitle,
    targetControlDisabled,
    targetControlToneClass,
    onAlignLeft,
    onAlignCenterX,
    onAlignRight,
    onAlignTop,
    onAlignCenterY,
    onAlignBottom,
  } = useAlignmentControlsModel({
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
    onAlignX,
    onAlignY,
  });

  return (
    <div className="mb-2">
      <AlignmentButtonsRow
        leftTitle={leftTitle}
        centerHTitle={centerHTitle}
        rightTitle={rightTitle}
        topTitle={topTitle}
        centerVTitle={centerVTitle}
        bottomTitle={bottomTitle}
        onAlignLeft={onAlignLeft}
        onAlignCenterX={onAlignCenterX}
        onAlignRight={onAlignRight}
        onAlignTop={onAlignTop}
        onAlignCenterY={onAlignCenterY}
        onAlignBottom={onAlignBottom}
      />

      <div className="flex items-center gap-2 mt-1">
        <label className="inline-flex items-center gap-1 text-[10px] text-content-muted">
          <input
            type="checkbox"
            checked={templateAlignEnabled}
            disabled={!canAlignToTemplate}
            onChange={(e) => onTemplateAlignEnabledChange(e.target.checked)}
            className="accent-accent"
          />
          Align to template
        </label>
        <label
          className={`inline-flex items-center gap-1 text-[10px] ${targetControlToneClass}`}
        >
          <input
            type="radio"
            name="align-template-target"
            value="page"
            checked={templateAlignTarget === "page"}
            disabled={targetControlDisabled}
            onChange={() => onTemplateAlignTargetChange("page")}
            className="accent-accent"
          />
          Page
        </label>
        <label
          className={`inline-flex items-center gap-1 text-[10px] ${targetControlToneClass}`}
        >
          <input
            type="radio"
            name="align-template-target"
            value="margin"
            checked={templateAlignTarget === "margin"}
            disabled={targetControlDisabled}
            onChange={() => onTemplateAlignTargetChange("margin")}
            className="accent-accent"
          />
          Margin
        </label>
      </div>
    </div>
  );
}
