/**
 * SelectionOverlay - renders the dashed polygon bounding box for selected import.
 * Takes pre-computed polygon points as a string prop.
 */

interface SelectionOverlayProps {
  polyPoints: string;
}

export function SelectionOverlay({ polyPoints }: SelectionOverlayProps) {
  return (
    <polygon
      data-testid="selection-bbox"
      points={polyPoints}
      fill="none"
      stroke="var(--tf-accent)"
      strokeWidth={1}
      strokeDasharray="4 2"
      pointerEvents="none"
    />
  );
}
