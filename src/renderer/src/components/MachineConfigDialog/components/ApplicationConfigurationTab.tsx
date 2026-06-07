import React from "react";
import { Badge } from "../../Badge";
import { Field } from "./Field";
import { Section } from "./Section";
import type {
  InkServiceStation,
  InkServiceStationAction,
} from "../../../../types";
import type { MachineConfigDialogController } from "../hooks/useMachineConfigDialogController";
import { ChevronDown, Plus } from "lucide-react";
import { defaultStationActionForType } from "../utils/stationDefaults";

interface ApplicationConfigurationTabProps {
  controller: MachineConfigDialogController;
}

export function ApplicationConfigurationTab({
  controller,
}: ApplicationConfigurationTabProps) {
  const {
    appConfig,
    showStationList,
    setShowStationList,
    inputCls,
    handleDebugLoggingChange,
    updateStationField,
    updateStationActionField,
    handleTestStationLocation,
  } = controller;

  const {
    enablePerPathPasses,
    debugLoggingEnabled,
    showMachineCoordinates,
    respectSvgColorsOnCanvas,
    vinylCuttingEnabled,
    vinylBladeOffsetMM,
    vinylCornerAngleThresholdDeg,
    vinylMicroJogMagnitudeMM,
    showInkServiceStationsOnCanvas,
    inkServiceStations,
    setEnablePerPathPasses,
    setShowMachineCoordinates,
    setRespectSvgColorsOnCanvas,
    setVinylCuttingEnabled,
    setVinylBladeOffsetMM,
    setVinylCornerAngleThresholdDeg,
    setVinylMicroJogMagnitudeMM,
    setShowInkServiceStationsOnCanvas,
    addInkServiceStation,
    removeInkServiceStation,
    updateInkServiceStation,
  } = appConfig;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <Section title="G-code Pass Settings">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enablePerPathPasses}
            onChange={(e) => setEnablePerPathPasses(e.currentTarget.checked)}
            className="mt-0.5 accent-accent"
          />
          <div className="space-y-1">
            <div className="text-sm text-content">
              Enable per-path pass overrides in the Properties panel
            </div>
            <p className="text-xs text-content-faint">
              Off by default. When disabled, pass settings are managed at the
              layer/colour level only.
            </p>
          </div>
        </label>
      </Section>

      <Section title="Logging">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={debugLoggingEnabled}
            onChange={(e) => handleDebugLoggingChange(e.currentTarget.checked)}
            className="mt-0.5 accent-accent"
          />
          <div className="space-y-1">
            <div className="text-sm text-content">
              Enable debug command logging in console
            </div>
            <p className="text-xs text-content-faint">
              Shows low-level command transport details (HTTP endpoint, retries,
              and response preview). Keep off for normal use.
            </p>
          </div>
        </label>
      </Section>

      <Section title="Console Display">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={showMachineCoordinates}
            onChange={(e) => setShowMachineCoordinates(e.currentTarget.checked)}
            className="mt-0.5 accent-accent"
          />
          <div className="space-y-1">
            <div className="text-sm text-content">
              Show machine coordinates alongside work coordinates
            </div>
            <p className="text-xs text-content-faint">
              When enabled, machine coordinates (MPos) appear in brackets after
              the work position in the console header.
            </p>
          </div>
        </label>
      </Section>

      <Section title="Canvas Display">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={respectSvgColorsOnCanvas}
            onChange={(e) =>
              setRespectSvgColorsOnCanvas(e.currentTarget.checked)
            }
            className="mt-0.5 accent-accent"
          />
          <div className="space-y-1">
            <div className="text-sm text-content">
              Show imported SVG colours on canvas
            </div>
            <p className="text-xs text-content-faint">
              Uses original SVG path colours in the bed preview only. G-code
              generation remains unchanged.
            </p>
          </div>
        </label>
      </Section>

      <Section title="Vinyl Cutting Mode">
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={vinylCuttingEnabled}
              onChange={(e) => setVinylCuttingEnabled(e.currentTarget.checked)}
              className="mt-0.5 accent-accent"
            />
            <div className="space-y-1">
              <div className="text-sm text-content flex items-center gap-2 flex-wrap">
                <span>Enable vinyl cutting features</span>
                <Badge variant="warning">Experimental</Badge>
              </div>
              <p className="text-xs text-content-faint">
                Exposes drag-knife compensation controls in G-code generation
                and stores default compensation values here.
              </p>
            </div>
          </label>

          {vinylCuttingEnabled && (
            <div className="grid grid-cols-1 gap-3 pl-6">
              <Field label="Blade offset (mm) (Distance between blade tip and its pivot)">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={vinylBladeOffsetMM}
                  onChange={(e) =>
                    setVinylBladeOffsetMM(Number(e.target.value))
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Corner angle threshold (degrees) (minimum angle to apply corner compensation)">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={vinylCornerAngleThresholdDeg}
                  onChange={(e) =>
                    setVinylCornerAngleThresholdDeg(Number(e.target.value))
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Blade rotation offset (mm) (extra movement to ensure proper blade swivel - this should be close to 0)">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={vinylMicroJogMagnitudeMM}
                  onChange={(e) =>
                    setVinylMicroJogMagnitudeMM(Number(e.target.value))
                  }
                  className={inputCls}
                />
              </Field>
            </div>
          )}
        </div>
      </Section>

      <Section title="Ink Service Stations">
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showInkServiceStationsOnCanvas}
              onChange={(e) =>
                setShowInkServiceStationsOnCanvas(e.currentTarget.checked)
              }
              className="mt-0.5 accent-accent"
            />
            <div className="space-y-1">
              <div className="text-sm text-content">
                Show station markers on plot canvas
              </div>
              <p className="text-xs text-content-faint">
                Renders Prime, Wipe, Dip, and Wash points on the bed preview to
                verify tray placement.
              </p>
            </div>
          </label>

          <div className="pl-6 pt-1">
            <button
              type="button"
              onClick={() => setShowStationList((open) => !open)}
              className="flex items-center gap-1.5 text-xs text-content-muted hover:text-content transition-colors select-none"
            >
              <ChevronDown
                size={14}
                className={`transition-transform duration-150 ${showStationList ? "rotate-0" : "-rotate-90"}`}
              />
              Dip Station List
            </button>
          </div>

          {showStationList && (
            <div className="pl-6 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-content-faint">
                  Edit coordinates in mm. Use Test to jog to a station.
                </p>
                <button
                  type="button"
                  onClick={addInkServiceStation}
                  title="Add Dip Station"
                  aria-label="Add Dip Station"
                  className="inline-flex items-center justify-center px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary-hover text-content"
                >
                  <Plus size={12} />
                </button>
              </div>

              {inkServiceStations.map((station) => (
                <StationRow
                  key={station.id}
                  station={station}
                  inputCls={inputCls}
                  updateInkServiceStation={updateInkServiceStation}
                  updateStationField={updateStationField}
                  updateStationActionField={updateStationActionField}
                  handleTestStationLocation={handleTestStationLocation}
                  removeInkServiceStation={removeInkServiceStation}
                  canRemove={inkServiceStations.length > 1}
                />
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

interface StationRowProps {
  station: InkServiceStation;
  inputCls: string;
  updateInkServiceStation: (
    stationId: string,
    patch: Partial<InkServiceStation>,
  ) => void;
  updateStationField: <K extends keyof InkServiceStation>(
    stationId: string,
    key: K,
    value: InkServiceStation[K],
  ) => void;
  updateStationActionField: (
    station: InkServiceStation,
    patch: Partial<InkServiceStationAction>,
  ) => void;
  handleTestStationLocation: (station: InkServiceStation) => Promise<void>;
  removeInkServiceStation: (stationId: string) => void;
  canRemove: boolean;
}

function StationRow({
  station,
  inputCls,
  updateInkServiceStation,
  updateStationField,
  updateStationActionField,
  handleTestStationLocation,
  removeInkServiceStation,
  canRemove,
}: StationRowProps) {
  return (
    <div className="rounded border border-border-ui p-2 grid grid-cols-12 gap-2 items-end">
      <div className="col-span-3">
        <label className="text-xs text-content-faint">Name</label>
        <input
          type="text"
          value={station.name}
          onChange={(e) =>
            updateStationField(station.id, "name", e.target.value)
          }
          className={inputCls}
        />
      </div>

      <div className="col-span-2">
        <label className="text-xs text-content-faint">Type</label>
        <select
          value={station.type}
          onChange={(e) => {
            const nextType = e.target.value as InkServiceStation["type"];
            updateInkServiceStation(station.id, {
              type: nextType,
              action: defaultStationActionForType(nextType),
            });
          }}
          className={inputCls}
        >
          <option value="prime">Prime</option>
          <option value="wipe">Wipe</option>
          <option value="dip">Dip</option>
          <option value="wash">Wash</option>
        </select>
      </div>

      <div className="col-span-2">
        <label className="text-xs text-content-faint">X (mm)</label>
        <input
          type="number"
          step={0.1}
          value={station.x}
          onChange={(e) =>
            updateStationField(station.id, "x", Number(e.target.value))
          }
          className={inputCls}
        />
      </div>

      <div className="col-span-2">
        <label className="text-xs text-content-faint">Y (mm)</label>
        <input
          type="number"
          step={0.1}
          value={station.y}
          onChange={(e) =>
            updateStationField(station.id, "y", Number(e.target.value))
          }
          className={inputCls}
        />
      </div>

      <div className="col-span-1">
        <label className="text-xs text-content-faint">ms</label>
        <input
          type="number"
          min={0}
          step={50}
          value={station.dwellMs}
          onChange={(e) =>
            updateStationField(station.id, "dwellMs", Number(e.target.value))
          }
          className={inputCls}
        />
      </div>

      <div className="col-span-2 flex gap-1 justify-end">
        <button
          type="button"
          onClick={() => void handleTestStationLocation(station)}
          className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary-hover text-content"
        >
          Test
        </button>
        <button
          type="button"
          onClick={() => removeInkServiceStation(station.id)}
          disabled={!canRemove}
          className="px-2 py-1 text-xs rounded bg-red-700/80 hover:bg-red-700 text-white disabled:opacity-40"
        >
          Remove
        </button>
      </div>

      {(station.type === "prime" ||
        station.type === "dip" ||
        station.type === "wash") && (
        <div className="col-span-12 border-t border-border-ui/70 pt-2 mt-1 grid grid-cols-12 gap-2">
          <div className="col-span-3 text-xs text-content-faint self-center">
            Action
          </div>

          {station.type === "prime" && (
            <>
              <div className="col-span-3">
                <label className="text-xs text-content-faint">
                  Press Count
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={
                    station.action?.kind === "prime-press"
                      ? station.action.pressCount
                      : 3
                  }
                  onChange={(e) =>
                    updateStationActionField(station, {
                      kind: "prime-press",
                      pressCount: Math.max(
                        1,
                        Math.round(Number(e.target.value) || 1),
                      ),
                    })
                  }
                  className={inputCls}
                />
              </div>
              <div className="col-span-3">
                <label className="text-xs text-content-faint">
                  Z Depth (mm)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={
                    station.action?.kind === "prime-press"
                      ? station.action.zDepthMM
                      : 1
                  }
                  onChange={(e) =>
                    updateStationActionField(station, {
                      kind: "prime-press",
                      zDepthMM: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className={inputCls}
                />
              </div>
            </>
          )}

          {(station.type === "dip" || station.type === "wash") && (
            <>
              <div className="col-span-3">
                <label className="text-xs text-content-faint">Pattern</label>
                <select
                  value={
                    station.action?.kind === "brush-motion"
                      ? station.action.pattern
                      : "back-forth"
                  }
                  onChange={(e) =>
                    updateStationActionField(station, {
                      kind: "brush-motion",
                      pattern: e.target
                        .value as InkServiceStationAction extends infer T
                        ? T extends { kind: "brush-motion"; pattern: infer P }
                          ? P
                          : never
                        : never,
                    })
                  }
                  className={inputCls}
                >
                  <option value="back-forth">Back and forth</option>
                  <option value="circular">Circular</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-content-faint">Reps</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={
                    station.action?.kind === "brush-motion"
                      ? station.action.repetitions
                      : 3
                  }
                  onChange={(e) =>
                    updateStationActionField(station, {
                      kind: "brush-motion",
                      repetitions: Math.max(
                        1,
                        Math.round(Number(e.target.value) || 1),
                      ),
                    })
                  }
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-content-faint">
                  {station.action?.kind === "brush-motion" &&
                  station.action.pattern === "circular"
                    ? "Radius (mm)"
                    : "Distance (mm)"}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={
                    station.action?.kind === "brush-motion"
                      ? station.action.distanceMM
                      : 2
                  }
                  onChange={(e) =>
                    updateStationActionField(station, {
                      kind: "brush-motion",
                      distanceMM: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-content-faint">
                  Z Depth (mm)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={
                    station.action?.kind === "brush-motion"
                      ? station.action.zDepthMM
                      : 2
                  }
                  onChange={(e) =>
                    updateStationActionField(station, {
                      kind: "brush-motion",
                      zDepthMM: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className={inputCls}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
