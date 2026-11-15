import type { GcodePrefs } from "../gcodePrefs";
import { CheckboxOption, OptionSection } from "./optionControls";

interface OutputSectionProps {
  open: boolean;
  showHeader?: boolean;
  connected: boolean;
  sourceLayerCount: number;
  layerGroupCount: number;
  colorGroupCount: number;
  prefs: GcodePrefs;
  onToggleOpen: () => void;
  onTogglePref: (key: keyof GcodePrefs) => void;
}

export function OutputSection({
  open,
  showHeader = true,
  connected,
  sourceLayerCount,
  layerGroupCount,
  colorGroupCount,
  prefs,
  onToggleOpen,
  onTogglePref,
}: OutputSectionProps) {
  const splitOutputEnabled =
    prefs.exportPerLayer || prefs.exportPerGroup || prefs.exportPerColor;
  const uploadToFolderEnabled = prefs.uploadToSd && splitOutputEnabled;
  const activeSplitKey: "exportPerLayer" | "exportPerGroup" | "exportPerColor" =
    prefs.exportPerLayer
      ? "exportPerLayer"
      : prefs.exportPerGroup
        ? "exportPerGroup"
        : "exportPerColor";

  return (
    <OptionSection title="Output" open={open} showHeader={showHeader} onToggleOpen={onToggleOpen}>
      <CheckboxOption
        label="Upload to SD card"
        checked={prefs.uploadToSd}
        onChange={() => onTogglePref("uploadToSd")}
        description="Upload the generated file directly to the machine SD card. Auto-selects it as the queued job."
        labelAside={
          !connected && (
            <span className="text-xs text-amber-400 font-normal">(not connected — will be skipped)</span>
          )
        }
      />

      <div className="ml-6 -mt-2">
        <CheckboxOption
          compact
          label="Create folder for split files"
          checked={prefs.uploadSplitToFolder}
          onChange={() => onTogglePref("uploadSplitToFolder")}
          disabled={!uploadToFolderEnabled}
          description="Split files will be uploaded to a folder named after the job"
        />
      </div>

      <CheckboxOption
        label="Save to computer"
        checked={prefs.saveLocally}
        onChange={() => onTogglePref("saveLocally")}
        description="Open a save dialog to choose where to write the G-code file on this computer."
      />

      <CheckboxOption
        label="Split output into separate files"
        checked={splitOutputEnabled}
        onChange={() => onTogglePref(splitOutputEnabled ? activeSplitKey : "exportPerLayer")}
        description="Choose how G-code should be split before saving or uploading."
      />

      <SplitOutputChoices
        prefs={prefs}
        enabled={splitOutputEnabled}
        sourceLayerCount={sourceLayerCount}
        layerGroupCount={layerGroupCount}
        colorGroupCount={colorGroupCount}
        onTogglePref={onTogglePref}
      />
    </OptionSection>
  );
}

/** How the output is split into files: by SVG layer, group or colour (one
 * at a time), and optionally separate hatch files per colour. Each warns
 * when it would produce nothing. */
function SplitOutputChoices({
  prefs,
  enabled: splitOutputEnabled,
  sourceLayerCount,
  layerGroupCount,
  colorGroupCount,
  onTogglePref,
}: {
  prefs: GcodePrefs;
  enabled: boolean;
  sourceLayerCount: number;
  layerGroupCount: number;
  colorGroupCount: number;
  onTogglePref: (key: keyof GcodePrefs) => void;
}) {
  return (
    <div
      className={`ml-6 -mt-2 flex flex-col gap-2 ${splitOutputEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}
    >
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="radio"
          name="gcode-output-split-mode"
          aria-label="Export one file per SVG layer"
          className="mt-0.5 accent-accent cursor-pointer"
          checked={prefs.exportPerLayer}
          onChange={() => onTogglePref("exportPerLayer")}
          disabled={!splitOutputEnabled}
        />
        <div>
          <div className="text-xs text-content">
            Export one file per SVG layer
          </div>
          <div className="text-[11px] text-content-muted">
            Generate a separate G-code file for each detected source SVG
            layer.
          </div>
          {prefs.exportPerLayer && sourceLayerCount === 0 && (
            <div className="text-xs text-amber-400 mt-1">
              No source layers detected - layer export would produce no files.
            </div>
          )}
        </div>
      </label>

      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="radio"
          name="gcode-output-split-mode"
          aria-label="Export one file per group"
          className="mt-0.5 accent-accent cursor-pointer"
          checked={prefs.exportPerGroup}
          onChange={() => onTogglePref("exportPerGroup")}
          disabled={!splitOutputEnabled}
        />
        <div>
          <div className="text-xs text-content">
            Export one file per group
          </div>
          <div className="text-[11px] text-content-muted">
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

      <div className="flex items-start gap-2 select-none">
        <input
          type="radio"
          name="gcode-output-split-mode"
          aria-label="Export one file per colour group"
          className="mt-0.5 accent-accent cursor-pointer"
          checked={prefs.exportPerColor}
          onChange={() => onTogglePref("exportPerColor")}
          disabled={!splitOutputEnabled}
        />
        <div>
          <div className="text-xs text-content">
            Export one file per colour group
          </div>
          <div className="text-[11px] text-content-muted">
            Generate a separate G-code file for each detected source color
            - ideal for pen-swap workflows.
          </div>
          {prefs.exportPerColor && colorGroupCount === 0 && (
            <div className="text-xs text-amber-400 mt-1">
              No fill colours detected - color export would produce no files.
            </div>
          )}
        </div>
      </div>

      <CheckboxOption
        compact
        label="Export separate hatch files per colour"
        checked={prefs.exportPerHatch}
        onChange={() => onTogglePref("exportPerHatch")}
        disabled={!prefs.exportPerColor}
        // This block already greys everything when output is not split.
        dimmed={splitOutputEnabled && !prefs.exportPerColor}
        description="Generate additional hatch-only files for each color group, allowing you to apply hatches with a separate tool/pen."
      >
        {prefs.exportPerHatch && !prefs.exportPerColor && (
          <div className="text-xs text-amber-400 mt-1">
            Enable "Export one file per colour group" to use this option.
          </div>
        )}
      </CheckboxOption>
    </div>
  );
}
