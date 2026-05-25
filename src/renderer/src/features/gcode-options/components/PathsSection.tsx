import { ChevronDown } from "lucide-react";
import type { GcodePrefs } from "../gcodePrefs";
import { Badge } from "../../../components/Badge";

interface PathsSectionProps {
  open: boolean;
  showHeader?: boolean;
  prefs: GcodePrefs;
  onToggleOpen: () => void;
  onTogglePref: (key: keyof GcodePrefs) => void;
  onPathDirectionModeChange: (mode: GcodePrefs["pathDirectionMode"]) => void;
  onJoinToleranceChange: (value: string) => void;
}

export function PathsSection({
  open,
  showHeader = true,
  prefs,
  onToggleOpen,
  onTogglePref,
  onPathDirectionModeChange,
  onJoinToleranceChange,
}: PathsSectionProps) {
  const content = (
    <div className="flex flex-col gap-4 mt-2 mb-1">
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          aria-label="Optimise paths"
          className="mt-0.5 accent-accent cursor-pointer"
          checked={prefs.optimise}
          onChange={() => onTogglePref("optimise")}
        />
        <div>
          <div className="text-sm text-content font-medium">Optimise paths</div>
          <div className="text-xs text-content-muted mt-0.5">
            Reorder subpaths with a nearest-neighbour algorithm to minimise
            total rapid-travel distance between strokes.
          </div>
        </div>
      </label>

      <div
        className={`ml-6 -mt-2 flex flex-col gap-2 ${prefs.optimise ? "opacity-100" : "opacity-40 pointer-events-none"}`}
      >
        <div className="text-xs text-content-muted">Path direction</div>
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="radio"
            name="path-direction-mode"
            aria-label="Minimize travel by reversing paths"
            className="mt-0.5 accent-accent cursor-pointer"
            checked={prefs.pathDirectionMode === "minimize-travel"}
            onChange={() => onPathDirectionModeChange("minimize-travel")}
            disabled={!prefs.optimise}
          />
          <div>
            <div className="text-xs text-content">
              Minimize travel by reversing paths
            </div>
            <div className="text-[11px] text-content-muted">
              Allows optimisation to reverse a path when that shortens rapid
              moves.
            </div>
          </div>
        </label>
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="radio"
            name="path-direction-mode"
            aria-label="Respect source path direction"
            className="mt-0.5 accent-accent cursor-pointer"
            checked={prefs.pathDirectionMode === "respect"}
            onChange={() => onPathDirectionModeChange("respect")}
            disabled={!prefs.optimise}
          />
          <div>
            <div className="text-xs text-content">
              Respect source path direction
            </div>
            <div className="text-[11px] text-content-muted">
              Keeps each path in its original direction during optimisation.
            </div>
          </div>
        </label>
      </div>

      <div className="flex items-start gap-3 select-none">
        <input
          type="checkbox"
          aria-label="Join nearby paths"
          className="mt-0.5 accent-accent cursor-pointer flex-shrink-0"
          checked={prefs.joinPaths}
          onChange={() => onTogglePref("joinPaths")}
          id="join-paths-cb"
        />
        <div className="flex-1 min-w-0">
          <label
            htmlFor="join-paths-cb"
            className="cursor-pointer flex items-center gap-2 flex-wrap"
          >
            <span className="text-sm text-content font-medium">
              Join nearby paths
            </span>
            <Badge variant="warning">Experimental</Badge>
          </label>
          <div className="text-xs text-content-muted mt-0.5">
            skipping pen up/down between nearly-touching strokes.
          </div>
          <div
            className={`flex items-center gap-2 mt-2 transition-opacity ${prefs.joinPaths ? "opacity-100" : "opacity-30 pointer-events-none"}`}
          >
            <label className="text-xs text-content-muted whitespace-nowrap">
              Tolerance
            </label>
            <input
              type="number"
              min="0.01"
              max="10"
              step="0.05"
              value={prefs.joinTolerance}
              onChange={(e) => onJoinToleranceChange(e.target.value)}
              disabled={!prefs.joinPaths}
              className="w-20 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent"
            />
            <span className="text-xs text-content-muted">mm</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (!showHeader) return <div>{content}</div>;

  return (
    <div>
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex items-center gap-1.5 text-xs font-semibold text-content-faint hover:text-content uppercase tracking-wider transition-colors select-none w-full text-left py-1"
      >
        <ChevronDown
          size={13}
          className={`transition-transform duration-150 flex-shrink-0 ${open ? "rotate-0" : "-rotate-90"}`}
        />
        Paths
      </button>
      {open && content}
    </div>
  );
}
