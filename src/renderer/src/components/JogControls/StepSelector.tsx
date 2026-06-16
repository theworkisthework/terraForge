import type { JogStep } from "../../../../types";
import { Tooltip } from "../Tooltip";
import { Button } from "../ui";

interface StepSelectorProps {
  step: JogStep;
  onChange: (step: JogStep) => void;
}

const STEPS: JogStep[] = [0.1, 1, 10, 100];

/**
 * A row of toggle buttons for selecting the jog increment (0.1 / 1 / 10 / 100 mm).
 */
export function StepSelector({ step, onChange }: StepSelectorProps) {
  return (
    <div className="flex gap-1 mb-4">
      {STEPS.map((s) => (
        <Tooltip
          key={s}
          text="Selected increment to move X, Y & Z by"
          className="flex-1"
        >
          <Button
            variant="toggle"
            selected={step === s}
            onClick={() => onChange(s)}
            className="w-full"
          >
            {s}
          </Button>
        </Tooltip>
      ))}
    </div>
  );
}
