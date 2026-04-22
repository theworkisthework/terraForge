import { ChevronDown } from "lucide-react";
import type { GcodePrefs } from "../gcodePrefs";

interface OutputSectionProps {
  open: boolean;
  connected: boolean;
  layerGroupCount: number;
  colorGroupCount: number;
  prefs: GcodePrefs;
  onToggleOpen: () => void;
  onTogglePref: (key: keyof GcodePrefs) => void;
}

export function OutputSection({
  open,
  connected,
  layerGroupCount,
  colorGroupCount,
  prefs,
  onToggleOpen,
  onTogglePref,
}: OutputSectionProps) {
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
        Output
      </button>
      {open && (
        <div className="flex flex-col gap-4 mt-2 mb-1">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Upload to SD card"
              className="mt-0.5 accent-accent cursor-pointer"
              checked={prefs.uploadToSd}
              onChange={() => onTogglePref("uploadToSd")}
            />
            <div className="min-w-0">
              <div className="text-sm text-content font-medium flex items-center flex-wrap gap-x-1.5">
                Upload to SD card
                {!connected && (
                  <span className="text-xs text-amber-400 font-normal">
                    (not connected — will be skipped)
                  </span>
                )}
              </div>
              <div className="text-xs text-content-muted mt-0.5">
                Upload the generated file directly to the machine SD card root.
                Auto-selects it as the queued job.
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Save to computer"
              className="mt-0.5 accent-accent cursor-pointer"
              checked={prefs.saveLocally}
              onChange={() => onTogglePref("saveLocally")}
            />
            <div>
              <div className="text-sm text-content font-medium">
                Save to computer
              </div>
              <div className="text-xs text-content-muted mt-0.5">
                Open a save dialog to choose where to write the G-code file on
                this computer.
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Export one file per group"
              className="mt-0.5 accent-accent cursor-pointer"
              checked={prefs.exportPerGroup}
              onChange={() => onTogglePref("exportPerGroup")}
            />
            <div>
              <div className="text-sm text-content font-medium">
                Export one file per group
              </div>
              <div className="text-xs text-content-muted mt-0.5">
                Generate a separate G-code file for each layer group - ideal for
                multi-colour pen plots. Each file is named after its group.
              </div>
              {prefs.exportPerGroup && layerGroupCount === 0 && (
                <div className="text-xs text-amber-400 mt-1">
                  No groups defined - add groups in the Properties panel first.
                </div>
              )}
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Export one file per colour group"
              className="mt-0.5 accent-accent cursor-pointer"
              checked={prefs.exportPerColor}
              onChange={() => onTogglePref("exportPerColor")}
            />
            <div>
              <div className="text-sm text-content font-medium">
                Export one file per colour group
              </div>
              <div className="text-xs text-content-muted mt-0.5">
                Generate a separate G-code file for each detected path fill
                color - ideal for pen-swap workflows.
              </div>
              {prefs.exportPerColor && colorGroupCount === 0 && (
                <div className="text-xs text-amber-400 mt-1">
                  No fill colours detected - color export would produce no
                  files.
                </div>
              )}
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Export separate hatch files per colour"
              className="mt-0.5 accent-accent cursor-pointer"
              disabled={!prefs.exportPerColor}
              checked={prefs.exportPerHatch}
              onChange={() => onTogglePref("exportPerHatch")}
            />
            <div>
              <div className="text-sm text-content font-medium">
                Export separate hatch files per colour
              </div>
              <div className="text-xs text-content-muted mt-0.5">
                Generate additional hatch-only files for each color group,
                allowing you to apply hatches with a separate tool/pen. Requires
                "Export one file per colour group" to be enabled.
              </div>
              {prefs.exportPerHatch && !prefs.exportPerColor && (
                <div className="text-xs text-amber-400 mt-1">
                  Enable "Export one file per colour group" to use this option.
                </div>
              )}
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
