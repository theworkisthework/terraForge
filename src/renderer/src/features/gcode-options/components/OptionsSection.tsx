import { ChevronDown } from "lucide-react";
import type { GcodePrefs } from "../gcodePrefs";
import { CustomGcodeSection } from "./CustomGcodeSection";

interface OptionsSectionProps {
  open: boolean;
  showHeader?: boolean;
  customGcodeOpen: boolean;
  prefs: GcodePrefs;
  machinePenDownDelayMs: number;
  machinePenUpDelayMs: number;
  machineDrawSpeed: number;
  hasPageTemplate: boolean;
  onToggleOpen: () => void;
  onToggleCustomGcodeOpen: () => void;
  onTogglePref: (key: keyof GcodePrefs) => void;
  onSetPenDownDelayMs: (value: string) => void;
  onSetPenUpDelayMs: (value: string) => void;
  onSetDrawSpeedOverride: (value: string) => void;
  onSetInkServiceMode: (mode: GcodePrefs["inkServiceMode"]) => void;
  onSetInkServiceTriggerTravelMM: (value: string) => void;
  onSetInkServiceTriggerJitterPct: (value: string) => void;
  onSetInkServiceWashEveryNDips: (value: string) => void;
  onSetClipMode: (mode: GcodePrefs["clipMode"]) => void;
  onSetClipOffset: (value: string) => void;
  onSetTextField: (key: keyof GcodePrefs) => (value: string) => void;
}

export function OptionsSection({
  open,
  showHeader = true,
  customGcodeOpen,
  prefs,
  machinePenDownDelayMs,
  machinePenUpDelayMs,
  machineDrawSpeed,
  hasPageTemplate,
  onToggleOpen,
  onToggleCustomGcodeOpen,
  onTogglePref,
  onSetPenDownDelayMs,
  onSetPenUpDelayMs,
  onSetDrawSpeedOverride,
  onSetInkServiceMode,
  onSetInkServiceTriggerTravelMM,
  onSetInkServiceTriggerJitterPct,
  onSetInkServiceWashEveryNDips,
  onSetClipMode,
  onSetClipOffset,
  onSetTextField,
}: OptionsSectionProps) {
  const content = (
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
            Send the pen-up command after the last stroke. Recommended to avoid
            leaving the pen pressed on the paper.
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

      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            aria-label="Override pen-up delay"
            className="mt-0.5 accent-accent cursor-pointer"
            checked={prefs.penUpDelayOverrideEnabled}
            onChange={() => onTogglePref("penUpDelayOverrideEnabled")}
          />
          <div>
            <div className="text-sm text-content font-medium">
              Override pen-up delay
            </div>
            <div className="text-xs text-content-muted mt-0.5">
              Add a dwell after pen-up before rapid travel begins.
            </div>
          </div>
        </label>

        <div className="flex items-center gap-2 pl-6">
          <input
            type="number"
            min="0"
            step="1"
            value={prefs.penUpDelayMs}
            onChange={(e) => onSetPenUpDelayMs(e.target.value)}
            disabled={!prefs.penUpDelayOverrideEnabled}
            aria-label="Pen-up delay override (ms)"
            className="w-24 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <span className="text-xs text-content-muted">ms</span>
          <span className="text-xs text-content-faint">
            Machine default: {machinePenUpDelayMs} ms
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            aria-label="Override draw speed"
            className="mt-0.5 accent-accent cursor-pointer"
            checked={prefs.drawSpeedOverrideEnabled}
            onChange={() => onTogglePref("drawSpeedOverrideEnabled")}
          />
          <div>
            <div className="text-sm text-content font-medium">
              Override draw speed
            </div>
            <div className="text-xs text-content-muted mt-0.5">
              Set a custom drawing speed (feedrate) for this job only.
            </div>
          </div>
        </label>

        <div className="flex items-center gap-2 pl-6">
          <input
            type="number"
            min="1"
            step="100"
            value={prefs.drawSpeedOverride}
            onChange={(e) => onSetDrawSpeedOverride(e.target.value)}
            disabled={!prefs.drawSpeedOverrideEnabled}
            aria-label="Draw speed override (mm/min)"
            className="w-24 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <span className="text-xs text-content-muted">mm/min</span>
          <span className="text-xs text-content-faint">
            Machine default: {machineDrawSpeed} mm/min
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            aria-label="Enable ink service moves"
            className="mt-0.5 accent-accent cursor-pointer"
            checked={prefs.inkServiceEnabled}
            onChange={() => onTogglePref("inkServiceEnabled")}
          />
          <div>
            <div className="text-sm text-content font-medium">
              Enable ink service moves
            </div>
            <div className="text-xs text-content-muted mt-0.5">
              Insert travel-triggered prime and wipe or brush dip moves during
              long jobs.
            </div>
          </div>
        </label>

        <div className="grid grid-cols-1 gap-2 pl-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-content-muted whitespace-nowrap">
              Mode
            </span>
            <select
              aria-label="Ink service mode"
              value={prefs.inkServiceMode}
              onChange={(e) =>
                onSetInkServiceMode(
                  e.target.value as GcodePrefs["inkServiceMode"],
                )
              }
              disabled={!prefs.inkServiceEnabled}
              className="px-2 py-1 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="prime-wipe">Prime and wipe</option>
              <option value="brush-dip">Brush dip</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-content-muted whitespace-nowrap">
              Trigger every
            </span>
            <input
              type="number"
              min="1"
              step="10"
              value={prefs.inkServiceTriggerTravelMM}
              onChange={(e) => onSetInkServiceTriggerTravelMM(e.target.value)}
              disabled={!prefs.inkServiceEnabled}
              aria-label="Ink service trigger travel distance (mm)"
              className="w-24 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-xs text-content-muted">mm travel</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-content-muted whitespace-nowrap">
              Randomness
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={prefs.inkServiceTriggerJitterPct}
              onChange={(e) => onSetInkServiceTriggerJitterPct(e.target.value)}
              disabled={!prefs.inkServiceEnabled}
              aria-label="Ink service trigger randomness percent"
              className="w-24 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-xs text-content-muted">%</span>
          </div>

          {prefs.inkServiceMode === "brush-dip" && (
            <>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  aria-label="Randomize dip station"
                  className="accent-accent cursor-pointer"
                  checked={prefs.inkServiceRandomizeDipStation}
                  onChange={() => onTogglePref("inkServiceRandomizeDipStation")}
                  disabled={!prefs.inkServiceEnabled}
                />
                <span className="text-xs text-content">
                  Randomize dip station
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  aria-label="Include wash moves"
                  className="accent-accent cursor-pointer"
                  checked={prefs.inkServiceIncludeWashMove}
                  onChange={() => onTogglePref("inkServiceIncludeWashMove")}
                  disabled={!prefs.inkServiceEnabled}
                />
                <span className="text-xs text-content">Include wash moves</span>
              </label>

              {prefs.inkServiceIncludeWashMove && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-content-muted whitespace-nowrap">
                    Wash every
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={prefs.inkServiceWashEveryNDips}
                    onChange={(e) =>
                      onSetInkServiceWashEveryNDips(e.target.value)
                    }
                    disabled={!prefs.inkServiceEnabled}
                    aria-label="Wash every N dips"
                    className="w-20 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs text-content-muted">dips</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {hasPageTemplate && (
        <div className="flex flex-col gap-1.5 select-none">
          <div className="text-sm text-white font-medium">Page clipping</div>
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
              <span className="text-xs text-content-muted">mm from edge</span>
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
        Options
      </button>
      {open && content}
    </div>
  );
}
