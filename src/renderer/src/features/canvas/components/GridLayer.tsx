/**
 * GridLayer - renders the 10mm grid with major (50mm) and minor (10mm) intervals.
 */
import { MM_TO_PX, PAD } from "../constants";

interface GridLayerProps {
  bedW: number;
  bedH: number;
  getBedY: (mm: number) => number;
}

export function GridLayer({ bedW, bedH, getBedY }: GridLayerProps) {
  return (
    <>
      {/* Vertical grid lines — 10 mm intervals, major every 50 mm */}
      {Array.from({ length: Math.floor(bedW / 10) + 1 }, (_, i) => i * 10).map(
        (mm) => (
          <line
            key={`vg-${mm}`}
            data-testid={`grid-v-${mm}`}
            x1={PAD + mm * MM_TO_PX}
            y1={PAD}
            x2={PAD + mm * MM_TO_PX}
            y2={PAD + bedH * MM_TO_PX}
            stroke="var(--tf-border)"
            strokeWidth={mm % 50 === 0 ? 0.8 : 0.3}
            pointerEvents="none"
          />
        ),
      )}
      {/* Horizontal grid lines — 10 mm intervals, major every 50 mm */}
      {Array.from({ length: Math.floor(bedH / 10) + 1 }, (_, i) => i * 10).map(
        (mm) => (
          <line
            key={`hg-${mm}`}
            data-testid={`grid-h-${mm}`}
            x1={PAD}
            y1={getBedY(mm)}
            x2={PAD + bedW * MM_TO_PX}
            y2={getBedY(mm)}
            stroke="var(--tf-border)"
            strokeWidth={mm % 50 === 0 ? 0.8 : 0.3}
            pointerEvents="none"
          />
        ),
      )}
    </>
  );
}
