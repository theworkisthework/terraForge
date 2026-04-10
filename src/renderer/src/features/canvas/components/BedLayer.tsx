/**
 * BedLayer - renders the bed rectangle border in SVG canvas space.
 * Represents the machine bed outline; the interior is filled by the canvas element.
 */
import { MM_TO_PX, PAD } from "../constants";

interface BedLayerProps {
  bedW: number;
  bedH: number;
}

export function BedLayer({ bedW, bedH }: BedLayerProps) {
  return (
    <rect
      data-testid="bed-layer"
      x={PAD}
      y={PAD}
      width={bedW * MM_TO_PX}
      height={bedH * MM_TO_PX}
      fill="none"
      stroke="var(--tf-border)"
      strokeWidth={1}
    />
  );
}
