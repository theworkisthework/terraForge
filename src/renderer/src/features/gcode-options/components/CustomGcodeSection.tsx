import { ChevronDown } from "lucide-react";
import type { GcodePrefs } from "../gcodePrefs";

interface CustomGcodeSectionProps {
  open: boolean;
  prefs: GcodePrefs;
  onToggleOpen: () => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
}

export function CustomGcodeSection({
  open,
  prefs,
  onToggleOpen,
  onCustomStartChange,
  onCustomEndChange,
}: CustomGcodeSectionProps) {
  return (
    <>
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex items-center gap-1.5 text-xs text-content-muted hover:text-content transition-colors select-none w-fit"
      >
        <ChevronDown
          size={14}
          className={`transition-transform duration-150 ${open ? "rotate-0" : "-rotate-90"}`}
        />
        Custom G-code
        {(prefs.customStartGcode || prefs.customEndGcode) && (
          <span className="ml-1 w-1.5 h-1.5 rounded-full bg-accent inline-block" />
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-3 pl-1">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted select-none">
              Start G-code
              <span className="ml-1 text-content-faint">(after preamble)</span>
            </label>
            <textarea
              aria-label="Custom start G-code"
              rows={3}
              value={prefs.customStartGcode}
              onChange={(e) => onCustomStartChange(e.target.value)}
              placeholder="; e.g. M3 S0"
              spellCheck={false}
              className="w-full px-2 py-1.5 text-xs font-mono rounded bg-secondary border border-secondary-hover text-content placeholder-content-faint focus:outline-none focus:border-accent resize-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted select-none">
              End G-code
              <span className="ml-1 text-content-faint">
                (after lift / return)
              </span>
            </label>
            <textarea
              aria-label="Custom end G-code"
              rows={3}
              value={prefs.customEndGcode}
              onChange={(e) => onCustomEndChange(e.target.value)}
              placeholder="; e.g. M5"
              spellCheck={false}
              className="w-full px-2 py-1.5 text-xs font-mono rounded bg-secondary border border-secondary-hover text-content placeholder-content-faint focus:outline-none focus:border-accent resize-none"
            />
          </div>
        </div>
      )}
    </>
  );
}
