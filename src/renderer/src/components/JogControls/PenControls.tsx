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
  onMovePen: (action: "up" | "down") => Promise<void>;
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
  const penDownTitle = isSolenoidPenType(penType)
    ? penDown
      ? `Pen Down: ${penDown}`
      : "No pen-down command configured"
    : "Pen Down: relative Z jog (direction follows machine config invert setting)";

  const penUpTitle = isSolenoidPenType(penType)
    ? penUp
      ? `Pen Up: ${penUp}`
      : "No pen-up command configured"
    : "Pen Up: relative Z jog (direction follows machine config invert setting)";

  return (
    <div className="flex gap-1 justify-center mb-4">
      <Tooltip text={penDownTitle}>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Pen down"
          onClick={() => onMovePen("down")}
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
          onClick={() => onMovePen("up")}
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
