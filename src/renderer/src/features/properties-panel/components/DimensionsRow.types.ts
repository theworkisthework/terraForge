export interface DimensionsRowProps {
  objW: number;
  objH: number;
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
  onRatioLockedChange: (locked: boolean) => void;
}
