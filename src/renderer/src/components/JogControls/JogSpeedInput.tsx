import { Tooltip } from "../Tooltip";

interface JogSpeedInputProps {
  feedrate: number;
  onChange: (value: number) => void;
}

/**
 * Numeric input for jog feedrate (mm/min), with a tooltip explaining scope.
 */
export function JogSpeedInput({ feedrate, onChange }: JogSpeedInputProps) {
  return (
    <div>
      <Tooltip text="Controls the speed of jog moves only (does not affect gcode speed settings).">
        <label className="text-xs text-content-faint block mb-1 cursor-help">
          Jog Speed (feedrate mm/min)
        </label>
      </Tooltip>
      <input
        type="number"
        value={feedrate}
        min={100}
        max={10000}
        step={100}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full text-xs bg-app border border-border-ui rounded px-2 py-1 text-content"
      />
    </div>
  );
}
