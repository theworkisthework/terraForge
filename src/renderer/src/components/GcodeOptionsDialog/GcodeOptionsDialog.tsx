import { useShallow } from "zustand/react/shallow";
import { useMachineStore } from "../../store/machineStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useAppConfigStore } from "../../store/appConfigStore";
import { selectGcodeOptionsDialogCanvasState } from "../../store/canvasSelectors";
import { TabHeader } from "../TabHeader";
import {
  type GcodeOptionsTab,
  useGcodeOptionsState,
} from "./hooks/useGcodeOptionsState";
import { GcodeOptionsDialogActions } from "./components/GcodeOptionsDialogActions";
import { GcodeOptionsDialogTabPanel } from "./components/GcodeOptionsDialogTabPanel";
import type { GcodePrefs } from "../../features/gcode-options/gcodePrefs";

interface Props {
  onConfirm: (prefs: GcodePrefs) => void;
  onCancel: () => void;
}

export function GcodeOptionsDialog({ onConfirm, onCancel }: Props) {
  const connected = useMachineStore((state) => state.connected);
  const activeConfig = useMachineStore((state) => state.activeConfig());
  const vinylCuttingEnabled = useAppConfigStore(
    (state) => state.vinylCuttingEnabled,
  );
  const inkServiceStations = useAppConfigStore(
    (state) => state.inkServiceStations,
  );
  const { layerGroupCount, colorGroupCount, pageTemplate } = useCanvasStore(
    useShallow(selectGcodeOptionsDialogCanvasState),
  );
  const {
    activeTab,
    customGcodeOpen,
    handleConfirm,
    layerDipOptions,
    neitherOutput,
    onKeyDown,
    prefs,
    setActiveTab,
    setClipMode,
    setClipOffsetMM,
    setCustomGcodeOpen,
    setDrawSpeedOverride,
    setInkServiceLayerDipStation,
    setInkServiceMode,
    setInkServiceTriggerJitterPct,
    setInkServiceTriggerTravelMM,
    setInkServiceWashEveryNDips,
    setJoinTolerance,
    setPathDirectionMode,
    setPenDownDelayMs,
    setPenUpDelayMs,
    setTextField,
    setVinylWeedBorderMargin,
    toggle,
  } = useGcodeOptionsState({ onCancel, onConfirm });

  const dipStations = inkServiceStations
    .filter((station) => station.type === "dip" && station.enabled !== false)
    .map((station) => ({ id: station.id, name: station.name }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gcode-options-title"
        className="bg-panel border border-border-ui rounded-lg shadow-2xl w-[420px] h-[min(66vh,760px)] max-h-[90vh] p-5 flex flex-col gap-4"
      >
        <h2
          id="gcode-options-title"
          className="text-content font-semibold text-sm tracking-widest uppercase"
        >
          Generate G-code
        </h2>

        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <TabHeader<GcodeOptionsTab>
            ariaLabel="G-code options sections"
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={[
              { id: "paths", label: "Paths" },
              { id: "options", label: "Options" },
              { id: "ink", label: "Paint/Ink" },
              ...(vinylCuttingEnabled
                ? ([{ id: "vinyl", label: "Vinyl" }] as const)
                : []),
              { id: "output", label: "Output" },
            ]}
          />

          <GcodeOptionsDialogTabPanel
            activeTab={activeTab}
            connected={connected}
            colorGroupCount={colorGroupCount}
            customGcodeOpen={customGcodeOpen}
            dipStations={dipStations}
            hasPageTemplate={!!pageTemplate}
            layerDipOptions={layerDipOptions}
            layerGroupCount={layerGroupCount}
            machineDrawSpeed={activeConfig?.drawSpeed ?? 3000}
            machinePenDownDelayMs={activeConfig?.penDownDelayMs ?? 0}
            machinePenUpDelayMs={activeConfig?.penUpDelayMs ?? 0}
            prefs={prefs}
            vinylCuttingEnabled={vinylCuttingEnabled}
            onPathDirectionModeChange={setPathDirectionMode}
            onSetActiveTab={setActiveTab}
            onSetClipMode={setClipMode}
            onSetClipOffset={setClipOffsetMM}
            onSetDrawSpeedOverride={setDrawSpeedOverride}
            onSetInkServiceLayerDipStation={setInkServiceLayerDipStation}
            onSetInkServiceMode={setInkServiceMode}
            onSetInkServiceTriggerJitterPct={setInkServiceTriggerJitterPct}
            onSetInkServiceTriggerTravelMM={setInkServiceTriggerTravelMM}
            onSetInkServiceWashEveryNDips={setInkServiceWashEveryNDips}
            onSetJoinTolerance={setJoinTolerance}
            onSetPenDownDelayMs={setPenDownDelayMs}
            onSetPenUpDelayMs={setPenUpDelayMs}
            onSetTextField={setTextField}
            onSetVinylWeedBorderMargin={setVinylWeedBorderMargin}
            onToggleCustomGcodeOpen={() => setCustomGcodeOpen((open) => !open)}
            onTogglePref={toggle}
          />
        </div>

        <GcodeOptionsDialogActions
          disabled={neitherOutput}
          onCancel={onCancel}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  );
}
