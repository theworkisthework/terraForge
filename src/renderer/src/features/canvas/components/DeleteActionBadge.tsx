import type { MouseEvent } from "react";
import { SquareX } from "lucide-react";

interface DeleteActionBadgeProps {
  x: number;
  y: number;
  onDelete: () => void;
  dataTestId?: string;
  halfSize?: number;
}

export function DeleteActionBadge({
  x,
  y,
  onDelete,
  dataTestId,
  halfSize = 8,
}: DeleteActionBadgeProps) {
  const onClick = (e: MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <g
      data-testid={dataTestId}
      transform={`translate(${x},${y})`}
      style={{ cursor: "pointer", pointerEvents: "all" }}
      onClick={onClick}
    >
      <SquareX
        x={-halfSize}
        y={-halfSize}
        width={halfSize * 2}
        height={halfSize * 2}
        stroke="var(--tf-accent)"
        strokeWidth={2.25}
      />
    </g>
  );
}
