import React from "react";
import { Button } from "../../../ui";
import type {
  InkServiceStation,
  InkServiceStationAction,
} from "../../../../../types";
import { defaultStationActionForType } from "../../utils/stationDefaults";

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

export function StationRow({
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleTestStationLocation(station)}
        >
          Test
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => removeInkServiceStation(station.id)}
          disabled={!canRemove}
        >
          Remove
        </Button>
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
