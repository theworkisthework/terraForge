import type { GcodePrefs } from "../gcodePrefs";
import { CustomGcodeSection } from "./CustomGcodeSection";
import { CheckboxOption, OptionSection, OverrideField } from "./optionControls";

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
  onSetClipMode,
  onSetClipOffset,
  onSetTextField,
}: OptionsSectionProps) {
  return (
    <OptionSection title="Options" open={open} showHeader={showHeader} onToggleOpen={onToggleOpen}>
      <CheckboxOption
        label="Lift pen at end"
        checked={prefs.liftPenAtEnd}
        onChange={() => onTogglePref("liftPenAtEnd")}
        description="Send the pen-up command after the last stroke. Recommended to avoid leaving the pen pressed on the paper."
      />
      <CheckboxOption
        label="Return to home (X0 Y0)"
        checked={prefs.returnToHome}
        onChange={() => onTogglePref("returnToHome")}
        description="Send the pen to the origin after the job finishes."
      />
      <OverrideField
        label="Override pen-down delay"
        checked={prefs.penDownDelayOverrideEnabled}
        onToggle={() => onTogglePref("penDownDelayOverrideEnabled")}
        description="Add a dwell after pen-down before XY drawing starts."
        inputLabel="Pen-down delay override (ms)"
        value={prefs.penDownDelayMs}
        onChange={onSetPenDownDelayMs}
        min="0"
        step="1"
        unit="ms"
        machineDefault={machinePenDownDelayMs}
      />
      <OverrideField
        label="Override pen-up delay"
        checked={prefs.penUpDelayOverrideEnabled}
        onToggle={() => onTogglePref("penUpDelayOverrideEnabled")}
        description="Add a dwell after pen-up before rapid travel begins."
        inputLabel="Pen-up delay override (ms)"
        value={prefs.penUpDelayMs}
        onChange={onSetPenUpDelayMs}
        min="0"
        step="1"
        unit="ms"
        machineDefault={machinePenUpDelayMs}
      />
      <OverrideField
        label="Override draw speed"
        checked={prefs.drawSpeedOverrideEnabled}
        onToggle={() => onTogglePref("drawSpeedOverrideEnabled")}
        description="Set a custom drawing speed (feedrate) for this job only."
        inputLabel="Draw speed override (mm/min)"
        value={prefs.drawSpeedOverride}
        onChange={onSetDrawSpeedOverride}
        min="1"
        step="100"
        unit="mm/min"
        machineDefault={machineDrawSpeed}
      />

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
    </OptionSection>
  );
}
