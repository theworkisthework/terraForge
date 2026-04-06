import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
} from "lucide-react";

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
  const btnCls =
    "p-1 text-content-faint hover:text-content rounded hover:bg-secondary/40 transition-colors";
  const useTemplateBounds = templateAlignEnabled && canAlignToTemplate;
  const inset = useTemplateBounds
    ? templateAlignTarget === "margin"
      ? Math.min(Math.max(marginMM, 0), pageW / 2, pageH / 2)
      : 0
    : 0;
  const minX = useTemplateBounds ? inset : 0;
  const maxX = useTemplateBounds ? pageW - inset : bedW;
  const minY = useTemplateBounds ? inset : 0;
  const maxY = useTemplateBounds ? pageH - inset : bedH;

  const frameName = useTemplateBounds
    ? templateAlignTarget === "margin"
      ? "margin"
      : "page"
    : "bed";
  const leftTitle = useTemplateBounds
    ? `Align left edge to ${frameName} left (X = ${Math.round(minX * 10) / 10})`
    : "Align left edge to bed left (X = 0)";
  const centerHTitle = useTemplateBounds
    ? `Centre horizontally (${frameName}) (X = ${Math.round((minX + (maxX - minX - objW) / 2) * 10) / 10} mm)`
    : `Centre horizontally (X = ${Math.round(((bedW - objW) / 2) * 10) / 10} mm)`;
  const rightTitle = useTemplateBounds
    ? `Align right edge to ${frameName} right (X = ${Math.round((maxX - objW) * 10) / 10} mm)`
    : `Align right edge to bed right (X = ${Math.round((bedW - objW) * 10) / 10} mm)`;
  const topTitle = useTemplateBounds
    ? `Align top edge to ${frameName} top (Y = ${Math.round((maxY - objH) * 10) / 10} mm)`
    : `Align top edge to bed top (Y = ${Math.round((bedH - objH) * 10) / 10} mm)`;
  const centerVTitle = useTemplateBounds
    ? `Centre vertically (${frameName}) (Y = ${Math.round((minY + (maxY - minY - objH) / 2) * 10) / 10} mm)`
    : `Centre vertically (Y = ${Math.round(((bedH - objH) / 2) * 10) / 10} mm)`;
  const bottomTitle = useTemplateBounds
    ? `Align bottom edge to ${frameName} bottom (Y = ${Math.round(minY * 10) / 10} mm)`
    : "Align bottom edge to bed bottom (Y = 0)";

  return (
    <div className="mb-2">
      <div className="flex items-center gap-0.5">
        <button
          className={btnCls}
          title={leftTitle}
          onClick={() => onAlignX(minX)}
        >
          <AlignHorizontalJustifyStart size={13} />
        </button>
        <button
          className={btnCls}
          title={centerHTitle}
          onClick={() => onAlignX(minX + (maxX - minX - objW) / 2)}
        >
          <AlignHorizontalJustifyCenter size={13} />
        </button>
        <button
          className={btnCls}
          title={rightTitle}
          onClick={() => onAlignX(maxX - objW)}
        >
          <AlignHorizontalJustifyEnd size={13} />
        </button>
        <div className="w-px h-3 bg-border-ui mx-0.5" />
        <button
          className={btnCls}
          title={topTitle}
          onClick={() => onAlignY(maxY - objH)}
        >
          <AlignVerticalJustifyStart size={13} />
        </button>
        <button
          className={btnCls}
          title={centerVTitle}
          onClick={() => onAlignY(minY + (maxY - minY - objH) / 2)}
        >
          <AlignVerticalJustifyCenter size={13} />
        </button>
        <button
          className={btnCls}
          title={bottomTitle}
          onClick={() => onAlignY(minY)}
        >
          <AlignVerticalJustifyEnd size={13} />
        </button>
      </div>

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
          className={`inline-flex items-center gap-1 text-[10px] ${templateAlignEnabled && canAlignToTemplate ? "text-content-muted" : "text-content-faint"}`}
        >
          <input
            type="radio"
            name="align-template-target"
            value="page"
            checked={templateAlignTarget === "page"}
            disabled={!templateAlignEnabled || !canAlignToTemplate}
            onChange={() => onTemplateAlignTargetChange("page")}
            className="accent-accent"
          />
          Page
        </label>
        <label
          className={`inline-flex items-center gap-1 text-[10px] ${templateAlignEnabled && canAlignToTemplate ? "text-content-muted" : "text-content-faint"}`}
        >
          <input
            type="radio"
            name="align-template-target"
            value="margin"
            checked={templateAlignTarget === "margin"}
            disabled={!templateAlignEnabled || !canAlignToTemplate}
            onChange={() => onTemplateAlignTargetChange("margin")}
            className="accent-accent"
          />
          Margin
        </label>
      </div>
    </div>
  );
}
