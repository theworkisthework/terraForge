import { useDimensionsRowModel } from "../hooks/useDimensionsRowModel";
import { DimensionInputField } from "./DimensionInputField";
import { RatioLockToggleButton } from "./RatioLockToggleButton";
import type { DimensionsRowProps } from "./DimensionsRow.types";

export function DimensionsRow({
  objW,
  objH,
  svgWidth,
  svgHeight,
  ratioLocked,
  currentScaleX,
  currentScaleY,
  onUpdate,
  onRatioLockedChange,
}: DimensionsRowProps) {
  const {
    widthValue,
    heightValue,
    ratioLockTitle,
    ratioLockClassName,
    onWidthChange,
    onHeightChange,
    onToggleRatioLock,
  } = useDimensionsRowModel({
    objW,
    objH,
    svgWidth,
    svgHeight,
    ratioLocked,
    currentScaleX,
    currentScaleY,
    onUpdate,
    onRatioLockedChange,
  });

  return (
    <div className="flex items-end gap-1 mb-0">
      <DimensionInputField
        label="W (mm)"
        value={widthValue}
        onChange={onWidthChange}
      />

      <RatioLockToggleButton
        ratioLocked={ratioLocked}
        title={ratioLockTitle}
        className={ratioLockClassName}
        onClick={onToggleRatioLock}
      />

      <DimensionInputField
        label="H (mm)"
        value={heightValue}
        onChange={onHeightChange}
      />
    </div>
  );
}
