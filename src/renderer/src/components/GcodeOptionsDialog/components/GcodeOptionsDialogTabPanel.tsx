import type { GcodePrefs } from "../../../features/gcode-options/gcodePrefs";
import { PathsSection } from "../../../features/gcode-options/components/PathsSection";
import { OptionsSection } from "../../../features/gcode-options/components/OptionsSection";
import { OutputSection } from "../../../features/gcode-options/components/OutputSection";
import { VinylSection } from "../../../features/gcode-options/components/VinylSection";
import { InkSection } from "../../../features/gcode-options/components/InkSection";
import type { LayerDipOption } from "../utils/buildLayerDipOptions";
import type { GcodeOptionsTab } from "../hooks/useGcodeOptionsState";

interface DipStationOption {
  id: string;
  name: string;
}

interface GcodeOptionsDialogTabPanelProps {
  activeTab: GcodeOptionsTab;
  connected: boolean;
  colorGroupCount: number;
  customGcodeOpen: boolean;
  dipStations: DipStationOption[];
  hasPageTemplate: boolean;
  layerDipOptions: LayerDipOption[];
  layerGroupCount: number;
  machineDrawSpeed: number;
  machinePenDownDelayMs: number;
  machinePenUpDelayMs: number;
  prefs: GcodePrefs;
  vinylCuttingEnabled: boolean;
  onPathDirectionModeChange: (mode: GcodePrefs["pathDirectionMode"]) => void;
  onSetClipMode: (mode: GcodePrefs["clipMode"]) => void;
  onSetClipOffset: (val: string) => void;
  onSetDrawSpeedOverride: (val: string) => void;
  onSetInkServiceLayerDipStation: (
    layerName: string,
    stationId: string,
  ) => void;
  onSetInkServiceMode: (mode: GcodePrefs["inkServiceMode"]) => void;
  onSetInkServiceTriggerJitterPct: (val: string) => void;
  onSetInkServiceTriggerTravelMM: (val: string) => void;
  onSetInkServiceWashEveryNDips: (val: string) => void;
  onSetJoinTolerance: (val: string) => void;
  onSetPenDownDelayMs: (val: string) => void;
  onSetPenUpDelayMs: (val: string) => void;
  onSetTextField: (key: keyof GcodePrefs) => (val: string) => void;
  onSetVinylWeedBorderMargin: (val: string) => void;
  onSetActiveTab: (tab: GcodeOptionsTab) => void;
  onToggleCustomGcodeOpen: () => void;
  onTogglePref: (key: keyof GcodePrefs) => void;
}

export function GcodeOptionsDialogTabPanel({
  activeTab,
  connected,
  colorGroupCount,
  customGcodeOpen,
  dipStations,
  hasPageTemplate,
  layerDipOptions,
  layerGroupCount,
  machineDrawSpeed,
  machinePenDownDelayMs,
  machinePenUpDelayMs,
  prefs,
  vinylCuttingEnabled,
  onPathDirectionModeChange,
  onSetActiveTab,
  onSetClipMode,
  onSetClipOffset,
  onSetDrawSpeedOverride,
  onSetInkServiceLayerDipStation,
  onSetInkServiceMode,
  onSetInkServiceTriggerJitterPct,
  onSetInkServiceTriggerTravelMM,
  onSetInkServiceWashEveryNDips,
  onSetJoinTolerance,
  onSetPenDownDelayMs,
  onSetPenUpDelayMs,
  onSetTextField,
  onSetVinylWeedBorderMargin,
  onToggleCustomGcodeOpen,
  onTogglePref,
}: GcodeOptionsDialogTabPanelProps) {
  return (
    <div
      role="tabpanel"
      aria-label={
        activeTab === "paths"
          ? "Paths"
          : activeTab === "options"
            ? "Options"
            : activeTab === "ink"
              ? "Ink"
              : activeTab === "vinyl"
                ? "Vinyl"
                : "Output"
      }
      className="flex-1 min-h-0 overflow-y-auto pr-1"
    >
      {activeTab === "paths" && (
        <PathsSection
          open={true}
          showHeader={false}
          prefs={prefs}
          onToggleOpen={() => onSetActiveTab("paths")}
          onTogglePref={onTogglePref}
          onPathDirectionModeChange={onPathDirectionModeChange}
          onJoinToleranceChange={onSetJoinTolerance}
        />
      )}

      {activeTab === "options" && (
        <OptionsSection
          open={true}
          showHeader={false}
          customGcodeOpen={customGcodeOpen}
          prefs={prefs}
          machinePenDownDelayMs={machinePenDownDelayMs}
          machinePenUpDelayMs={machinePenUpDelayMs}
          machineDrawSpeed={machineDrawSpeed}
          hasPageTemplate={hasPageTemplate}
          onToggleOpen={() => onSetActiveTab("options")}
          onToggleCustomGcodeOpen={onToggleCustomGcodeOpen}
          onTogglePref={onTogglePref}
          onSetPenDownDelayMs={onSetPenDownDelayMs}
          onSetPenUpDelayMs={onSetPenUpDelayMs}
          onSetDrawSpeedOverride={onSetDrawSpeedOverride}
          onSetClipMode={onSetClipMode}
          onSetClipOffset={onSetClipOffset}
          onSetTextField={onSetTextField}
        />
      )}

      {activeTab === "ink" && (
        <InkSection
          open={true}
          showHeader={false}
          prefs={prefs}
          layers={layerDipOptions}
          dipStations={dipStations}
          onToggleOpen={() => onSetActiveTab("ink")}
          onTogglePref={onTogglePref}
          onSetInkServiceMode={onSetInkServiceMode}
          onSetInkServiceTriggerTravelMM={onSetInkServiceTriggerTravelMM}
          onSetInkServiceTriggerJitterPct={onSetInkServiceTriggerJitterPct}
          onSetInkServiceWashEveryNDips={onSetInkServiceWashEveryNDips}
          onSetInkServiceLayerDipStation={onSetInkServiceLayerDipStation}
        />
      )}

      {activeTab === "vinyl" && vinylCuttingEnabled && (
        <VinylSection
          prefs={prefs}
          onTogglePref={onTogglePref}
          onSetVinylWeedBorderMargin={onSetVinylWeedBorderMargin}
        />
      )}

      {activeTab === "output" && (
        <OutputSection
          open={true}
          showHeader={false}
          connected={connected}
          layerGroupCount={layerGroupCount}
          colorGroupCount={colorGroupCount}
          prefs={prefs}
          onToggleOpen={() => onSetActiveTab("output")}
          onTogglePref={onTogglePref}
        />
      )}
    </div>
  );
}
