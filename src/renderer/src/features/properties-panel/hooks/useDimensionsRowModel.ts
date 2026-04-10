import type { DimensionsRowProps } from "../components/DimensionsRow.types";

const roundToThousandth = (value: number) => Math.round(value * 1000) / 1000;

export function useDimensionsRowModel({
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
  return {
    widthValue: roundToThousandth(objW),
    heightValue: roundToThousandth(objH),
    ratioLockTitle: ratioLocked
      ? "Ratio locked — click to unlock"
      : "Ratio unlocked — click to lock",
    ratioLockClassName: ratioLocked
      ? "mb-2 p-1.5 rounded transition-colors text-accent hover:text-accent hover:bg-secondary/40"
      : "mb-2 p-1.5 rounded transition-colors text-content-faint hover:text-content hover:bg-secondary/40",
    onWidthChange: (nextValue: number) => {
      const value = Math.max(0.001, nextValue);
      if (ratioLocked) {
        onUpdate({
          scale: value / svgWidth,
          scaleX: undefined,
          scaleY: undefined,
        });
        return;
      }

      onUpdate({ scaleX: value / svgWidth });
    },
    onHeightChange: (nextValue: number) => {
      const value = Math.max(0.001, nextValue);
      if (ratioLocked) {
        onUpdate({
          scale: value / svgHeight,
          scaleX: undefined,
          scaleY: undefined,
        });
        return;
      }

      onUpdate({ scaleY: value / svgHeight });
    },
    onToggleRatioLock: () => {
      if (ratioLocked) {
        onRatioLockedChange(false);
        onUpdate({ scaleX: currentScaleX, scaleY: currentScaleY });
        return;
      }

      onRatioLockedChange(true);
      onUpdate({ scale: currentScaleX, scaleX: undefined, scaleY: undefined });
    },
  };
}
