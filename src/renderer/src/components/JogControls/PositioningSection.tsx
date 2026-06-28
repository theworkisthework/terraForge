import { CircleSlash2, House } from "lucide-react";
import { Tooltip } from "../Tooltip";
import { Button } from "../ui";

interface PositioningSectionProps {
  connected: boolean;
  onHome: () => Promise<void>;
  onSetZero: () => Promise<void>;
}

/**
 * Homing and zero-position shortcut buttons.
 */
export function PositioningSection({
  connected,
  onHome,
  onSetZero,
}: PositioningSectionProps) {
  return (
    <div className="flex flex-col gap-1 mt-4">
      <span className="text-[9px] uppercase tracking-wider text-content-faint">
        Positioning
      </span>
      <Tooltip text="Run the machine homing cycle ($H)">
        <Button
          variant="secondary"
          onClick={onHome}
          disabled={!connected}
          className="w-full"
          icon={<House size={13} />}
        >
          Run Homing
        </Button>
      </Tooltip>
      <Tooltip text="Set the current position as X0, Y0 (Z is unaffected)">
        <Button
          variant="secondary"
          onClick={onSetZero}
          disabled={!connected}
          className="w-full"
          icon={<CircleSlash2 size={13} />}
        >
          Set Zero
        </Button>
      </Tooltip>
    </div>
  );
}
