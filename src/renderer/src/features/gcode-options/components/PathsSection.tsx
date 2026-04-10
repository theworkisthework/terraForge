import { ChevronDown } from "lucide-react";
import type { GcodePrefs } from "../gcodePrefs";

interface PathsSectionProps {
  open: boolean;
  prefs: GcodePrefs;
  onToggleOpen: () => void;
  onTogglePref: (key: keyof GcodePrefs) => void;
  onJoinToleranceChange: (value: string) => void;
}

export function PathsSection({
  open,
  prefs,
  onToggleOpen,
  onTogglePref,
  onJoinToleranceChange,
}: PathsSectionProps) {
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
      {open && (
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
              <div className="text-sm text-content font-medium">
                Optimise paths
              </div>
              <div className="text-xs text-content-muted mt-0.5">
                Reorder subpaths with a nearest-neighbour algorithm to minimise
                total rapid-travel distance between strokes.
              </div>
            </div>
          </label>

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
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 leading-none">
                  Experimental
                </span>
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
      )}
    </div>
  );
}
