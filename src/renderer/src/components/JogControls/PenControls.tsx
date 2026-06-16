import { CircleSlash2, Pen, PenLine, ArrowDown, ArrowUp } from "lucide-react";
import { isSolenoidPenType } from "../../../../types";
import { Tooltip } from "../Tooltip";
import { Button } from "../ui";

interface PenControlsProps {
  connected: boolean;
  penType: string;
  penDown: string;
  penUp: string;
  step: number;
  onMovePen: (dir: 1 | -1) => Promise<void>;
  onZeroZ: () => Promise<void>;
}

/**
 * Pen up / pen down / zero-Z button row.
 * For solenoid pens it sends the configured M-code; for servo/stepper it jogs Z.
 */
export function PenControls({
  connected,
  penType,
  penDown,
  penUp,
  step,
  onMovePen,
  onZeroZ,
}: PenControlsProps) {
  const penDownTitle = !isSolenoidPenType(penType)
    ? `Pen Down: jog Z by -${step} mm`
    : penDown
      ? `Pen Down: ${penDown}`
      : "No pen-down command configured";

  const penUpTitle = !isSolenoidPenType(penType)
    ? `Pen Up: jog Z by +${step} mm`
    : penUp
      ? `Pen Up: ${penUp}`
      : "No pen-up command configured";

  return (
    <div className="flex gap-1 justify-center mb-4">
      <Tooltip text={penDownTitle}>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Pen down"
          onClick={() => onMovePen(-1)}
          disabled={!connected || (isSolenoidPenType(penType) && !penDown)}
        >
          <PenLine size={15} />
          <ArrowDown size={11} />
        </Button>
      </Tooltip>
      <Tooltip text={penUpTitle}>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Pen up"
          onClick={() => onMovePen(1)}
          disabled={!connected || (isSolenoidPenType(penType) && !penUp)}
        >
          <Pen size={15} />
          <ArrowUp size={11} />
        </Button>
      </Tooltip>
      <Tooltip
        text={
          isSolenoidPenType(penType)
            ? "Zeroing Z disabled for solenoid."
            : "Zero Z axis (set current Z position as Z0)"
        }
      >
        <Button
          variant="secondary"
          size="sm"
          aria-label="Zero Z"
          onClick={onZeroZ}
          disabled={!connected || isSolenoidPenType(penType)}
        >
          <CircleSlash2 size={14} />
        </Button>
      </Tooltip>
    </div>
  );
}
