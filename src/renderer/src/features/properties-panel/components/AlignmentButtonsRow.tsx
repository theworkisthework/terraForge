import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
} from "lucide-react";

interface AlignmentButtonsRowProps {
  leftTitle: string;
  centerHTitle: string;
  rightTitle: string;
  topTitle: string;
  centerVTitle: string;
  bottomTitle: string;
  onAlignLeft: () => void;
  onAlignCenterX: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignCenterY: () => void;
  onAlignBottom: () => void;
}

export function AlignmentButtonsRow({
  leftTitle,
  centerHTitle,
  rightTitle,
  topTitle,
  centerVTitle,
  bottomTitle,
  onAlignLeft,
  onAlignCenterX,
  onAlignRight,
  onAlignTop,
  onAlignCenterY,
  onAlignBottom,
}: AlignmentButtonsRowProps) {
  const btnCls =
    "p-1 text-content-faint hover:text-content rounded hover:bg-secondary/40 transition-colors";

  return (
    <div className="flex items-center gap-0.5">
      <button className={btnCls} title={leftTitle} onClick={onAlignLeft}>
        <AlignHorizontalJustifyStart size={13} />
      </button>
      <button className={btnCls} title={centerHTitle} onClick={onAlignCenterX}>
        <AlignHorizontalJustifyCenter size={13} />
      </button>
      <button className={btnCls} title={rightTitle} onClick={onAlignRight}>
        <AlignHorizontalJustifyEnd size={13} />
      </button>
      <div className="w-px h-3 bg-border-ui mx-0.5" />
      <button className={btnCls} title={topTitle} onClick={onAlignTop}>
        <AlignVerticalJustifyStart size={13} />
      </button>
      <button className={btnCls} title={centerVTitle} onClick={onAlignCenterY}>
        <AlignVerticalJustifyCenter size={13} />
      </button>
      <button className={btnCls} title={bottomTitle} onClick={onAlignBottom}>
        <AlignVerticalJustifyEnd size={13} />
      </button>
    </div>
  );
}
