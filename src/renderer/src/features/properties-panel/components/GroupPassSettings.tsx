import type { ChangeEvent } from "react";
import type { PassMode } from "../../../../types";

interface GroupPassSettingsProps {
  label: string;
  passCount: number;
  passMode: PassMode;
  onPassCountChange: (next: number) => void;
  onPassModeChange: (next: PassMode) => void;
  indented?: boolean;
}

export function GroupPassSettings({
  label,
  passCount,
  passMode,
  onPassCountChange,
  onPassModeChange,
  indented = false,
}: GroupPassSettingsProps) {
  const handlePassCountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.currentTarget.value, 10);
    const next = Number.isFinite(raw) ? Math.max(1, Math.min(99, raw)) : 1;
    onPassCountChange(next);
  };

  const handlePassModeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onPassModeChange(e.currentTarget.value as PassMode);
  };

  return (
    <div className={`${indented ? "pl-3 " : ""}space-y-2 text-[10px]`}>
      <div className="text-content-muted uppercase text-[8px] tracking-wider">
        {label} pass settings
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-content-faint text-[9px]">Passes</span>
        <input
          type="number"
          min="1"
          max="99"
          value={passCount}
          onChange={handlePassCountChange}
          className="w-12 px-1 py-0.5 bg-secondary text-content text-[9px] rounded border border-border-ui/30 focus:outline-none focus:ring-1 focus:ring-accent"
          title="Number of times to repeat all paths in this group"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-content-faint text-[9px]">Mode</span>
        <select
          value={passMode}
          onChange={handlePassModeChange}
          className="px-1 py-0.5 bg-secondary text-content text-[9px] rounded border border-border-ui/30 focus:outline-none focus:ring-1 focus:ring-accent"
          title="Pass behavior for this group"
        >
          <option value="repeat">Repeat</option>
          <option value="backtrack">Backtrack</option>
          <option value="penLift">Pen Lift</option>
        </select>
      </div>
    </div>
  );
}
