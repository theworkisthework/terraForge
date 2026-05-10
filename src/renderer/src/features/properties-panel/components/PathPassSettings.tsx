import type { ChangeEvent } from "react";
import type { PassMode } from "../../../../types";

interface PathPassSettingsProps {
  pathId: string;
  pathLabel: string;
  passCount?: number;
  passMode?: PassMode;
  onUpdatePath: (
    pathId: string,
    patch: Partial<{ passCount: number; passMode: PassMode }>,
  ) => void;
  indented?: boolean;
}

export function PathPassSettings({
  pathId,
  pathLabel,
  passCount = 1,
  passMode = "repeat",
  onUpdatePath,
  indented = false,
}: PathPassSettingsProps) {
  const handlePassCountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1, Math.min(99, parseInt(e.currentTarget.value) || 1));
    onUpdatePath(pathId, { passCount: val });
  };

  const handlePassModeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onUpdatePath(pathId, { passMode: e.currentTarget.value as PassMode });
  };

  return (
    <div className={`${indented ? "pl-3 " : ""}space-y-2 text-[10px]`}>
      <div className="text-content-muted uppercase text-[8px] tracking-wider">
        {pathLabel} pass settings
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
          title="Number of times to repeat this path"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-content-faint text-[9px]">Mode</span>
        <select
          value={passMode}
          onChange={handlePassModeChange}
          className="px-1 py-0.5 bg-secondary text-content text-[9px] rounded border border-border-ui/30 focus:outline-none focus:ring-1 focus:ring-accent"
          title="How to handle multiple passes: repeat (draw same), backtrack (forward then reverse), or penLift (repeat with pen lift)"
        >
          <option value="repeat">Repeat</option>
          <option value="backtrack">Backtrack</option>
          <option value="penLift">Pen Lift</option>
        </select>
      </div>
    </div>
  );
}
