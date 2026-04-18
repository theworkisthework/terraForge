import { ChevronDown } from "lucide-react";
import type { GcodePrefs } from "../gcodePrefs";
import { CustomGcodeSection } from "./CustomGcodeSection";

interface OptionsSectionProps {
  open: boolean;
  customGcodeOpen: boolean;
  prefs: GcodePrefs;
  machinePenDownDelayMs: number;
  hasPageTemplate: boolean;
  onToggleOpen: () => void;
  onToggleCustomGcodeOpen: () => void;
  onTogglePref: (key: keyof GcodePrefs) => void;
  onSetPenDownDelayMs: (value: string) => void;
  onSetClipMode: (mode: GcodePrefs["clipMode"]) => void;
  onSetClipOffset: (value: string) => void;
  onSetTextField: (key: keyof GcodePrefs) => (value: string) => void;
}

export function OptionsSection({
  open,
  customGcodeOpen,
  prefs,
  machinePenDownDelayMs,
  hasPageTemplate,
  onToggleOpen,
  onToggleCustomGcodeOpen,
  onTogglePref,
  onSetPenDownDelayMs,
  onSetClipMode,
  onSetClipOffset,
  onSetTextField,
}: OptionsSectionProps) {
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
        Options
      </button>
      {open && (
        <div className="flex flex-col gap-4 mt-2 mb-1">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Lift pen at end"
              className="mt-0.5 accent-accent cursor-pointer"
              checked={prefs.liftPenAtEnd}
              onChange={() => onTogglePref("liftPenAtEnd")}
            />
            <div>
              <div className="text-sm text-content font-medium">
                Lift pen at end
              </div>
              <div className="text-xs text-content-muted mt-0.5">
                Send the pen-up command after the last stroke. Recommended to
                avoid leaving the pen pressed on the paper.
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Return to home (X0 Y0)"
              className="mt-0.5 accent-accent cursor-pointer"
              checked={prefs.returnToHome}
              onChange={() => onTogglePref("returnToHome")}
            />
            <div>
              <div className="text-sm text-content font-medium">
                Return to home (X0 Y0)
              </div>
              <div className="text-xs text-content-muted mt-0.5">
                Send the pen to the origin after the job finishes.
              </div>
            </div>
          </label>

          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label="Override pen-down delay"
                className="mt-0.5 accent-accent cursor-pointer"
                checked={prefs.penDownDelayOverrideEnabled}
                onChange={() => onTogglePref("penDownDelayOverrideEnabled")}
              />
              <div>
                <div className="text-sm text-content font-medium">
                  Override pen-down delay
                </div>
                <div className="text-xs text-content-muted mt-0.5">
                  Add a dwell after pen-down before XY drawing starts.
                </div>
              </div>
            </label>

            <div className="flex items-center gap-2 pl-6">
              <input
                type="number"
                min="0"
                step="1"
                value={prefs.penDownDelayMs}
                onChange={(e) => onSetPenDownDelayMs(e.target.value)}
                disabled={!prefs.penDownDelayOverrideEnabled}
                aria-label="Pen-down delay override (ms)"
                className="w-24 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <span className="text-xs text-content-muted">ms</span>
              <span className="text-xs text-content-faint">
                Machine default: {machinePenDownDelayMs} ms
              </span>
            </div>
          </div>

          {hasPageTemplate && (
            <div className="flex flex-col gap-1.5 select-none">
              <div className="text-sm text-white font-medium">
                Page clipping
              </div>
              <div className="flex flex-col gap-1">
                {(["none", "margin", "page"] as const).map((mode) => (
                  <label
                    key={mode}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="clipMode"
                      value={mode}
                      checked={prefs.clipMode === mode}
                      onChange={() => onSetClipMode(mode)}
                      className="accent-accent cursor-pointer"
                    />
                    <span className="text-xs text-content">
                      {mode === "none"
                        ? "No clipping"
                        : mode === "margin"
                          ? "Clip to margin"
                          : "Clip to page edge"}
                    </span>
                  </label>
                ))}
              </div>
              {prefs.clipMode === "page" && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-content-muted whitespace-nowrap">
                    Safety inset
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    aria-label="Safety inset (mm)"
                    value={prefs.clipOffsetMM}
                    onChange={(e) => onSetClipOffset(e.target.value)}
                    className="w-20 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent"
                  />
                  <span className="text-xs text-content-muted">
                    mm from edge
                  </span>
                </div>
              )}
              <div className="text-xs text-content-muted mt-0.5">
                {prefs.clipMode === "none" &&
                  "G-code is clipped to the machine bed only."}
                {prefs.clipMode === "margin" &&
                  "Clips to the margin boundary shown on canvas."}
                {prefs.clipMode === "page" &&
                  "Clips to the page edge. Add an inset to keep the pen safely on the paper."}
              </div>
            </div>
          )}

          <CustomGcodeSection
            open={customGcodeOpen}
            prefs={prefs}
            onToggleOpen={onToggleCustomGcodeOpen}
            onCustomStartChange={onSetTextField("customStartGcode")}
            onCustomEndChange={onSetTextField("customEndGcode")}
          />
        </div>
      )}
    </div>
  );
}
