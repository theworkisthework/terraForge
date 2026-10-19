import React from "react";
import { Button } from "../../../ui";
import type {
  InkServiceStation,
  InkServiceStationAction,
} from "../../../../../../types";
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

/** A labelled field; `span` is its column-span class (written out in full,
 * so Tailwind can find it). */
function StationField({ span, label, children }: { span: string; label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={span}>
      <label className="text-xs text-content-faint">{label}</label>
      {children}
    </div>
  );
}

/** A whole number of at least 1, from a number field. */
const atLeastOne = (value: string) => Math.max(1, Math.round(Number(value) || 1));
/** A non-negative number, from a number field. */
const nonNegative = (value: string) => Math.max(0, Number(value) || 0);

type BrushPattern = Extract<InkServiceStationAction, { kind: "brush-motion" }>["pattern"];

type ActionFieldsProps = Pick<StationRowProps, "station" | "inputCls" | "updateStationActionField">;

/** A prime station's press: how many presses, and how deep. */
function PrimeActionFields({ station, inputCls, updateStationActionField }: ActionFieldsProps) {
  const action = station.action?.kind === "prime-press" ? station.action : null;
  const update = (patch: Partial<InkServiceStationAction>) =>
    updateStationActionField(station, { kind: "prime-press", ...patch } as Partial<InkServiceStationAction>);
  return (
    <>
      <StationField span="col-span-3" label="Press Count">
        <input
          type="number"
          min={1}
          step={1}
          value={action ? action.pressCount : 3}
          onChange={(e) => update({ pressCount: atLeastOne(e.target.value) })}
          className={inputCls}
        />
      </StationField>
      <StationField span="col-span-3" label="Z Depth (mm)">
        <input
          type="number"
          min={0}
          step={0.1}
          value={action ? action.zDepthMM : 1}
          onChange={(e) => update({ zDepthMM: nonNegative(e.target.value) })}
          className={inputCls}
        />
      </StationField>
    </>
  );
}

/** A dip or wash station's brush motion: pattern, repetitions, size and depth. */
function BrushActionFields({ station, inputCls, updateStationActionField }: ActionFieldsProps) {
  const action = station.action?.kind === "brush-motion" ? station.action : null;
  const update = (patch: Partial<InkServiceStationAction>) =>
    updateStationActionField(station, { kind: "brush-motion", ...patch } as Partial<InkServiceStationAction>);
  return (
    <>
      <StationField span="col-span-3" label="Pattern">
        <select
          value={action ? action.pattern : "back-forth"}
          onChange={(e) => update({ pattern: e.target.value as BrushPattern })}
          className={inputCls}
        >
          <option value="back-forth">Back and forth</option>
          <option value="circular">Circular</option>
        </select>
      </StationField>
      <StationField span="col-span-2" label="Reps">
        <input
          type="number"
          min={1}
          step={1}
          value={action ? action.repetitions : 3}
          onChange={(e) => update({ repetitions: atLeastOne(e.target.value) })}
          className={inputCls}
        />
      </StationField>
      <StationField span="col-span-2" label={action && action.pattern === "circular" ? "Radius (mm)" : "Distance (mm)"}>
        <input
          type="number"
          min={0}
          step={0.1}
          value={action ? action.distanceMM : 2}
          onChange={(e) => update({ distanceMM: nonNegative(e.target.value) })}
          className={inputCls}
        />
      </StationField>
      <StationField span="col-span-2" label="Z Depth (mm)">
        <input
          type="number"
          min={0}
          step={0.1}
          value={action ? action.zDepthMM : 2}
          onChange={(e) => update({ zDepthMM: nonNegative(e.target.value) })}
          className={inputCls}
        />
      </StationField>
    </>
  );
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
  const numberField = (key: "x" | "y" | "dwellMs") => (e: React.ChangeEvent<HTMLInputElement>) =>
    updateStationField(station.id, key, Number(e.target.value));
  return (
    <div className="rounded border border-border-ui p-2 grid grid-cols-12 gap-2 items-end">
      <StationField span="col-span-3" label="Name">
        <input
          type="text"
          value={station.name}
          onChange={(e) => updateStationField(station.id, "name", e.target.value)}
          className={inputCls}
        />
      </StationField>

      <StationField span="col-span-2" label="Type">
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
      </StationField>

      <StationField span="col-span-2" label="X (mm)">
        <input type="number" step={0.1} value={station.x} onChange={numberField("x")} className={inputCls} />
      </StationField>
      <StationField span="col-span-2" label="Y (mm)">
        <input type="number" step={0.1} value={station.y} onChange={numberField("y")} className={inputCls} />
      </StationField>
      <StationField span="col-span-1" label="ms">
        <input
          type="number"
          min={0}
          step={50}
          value={station.dwellMs}
          onChange={numberField("dwellMs")}
          className={inputCls}
        />
      </StationField>

      <div className="col-span-2 flex gap-1 justify-end">
        <Button variant="secondary" size="sm" onClick={() => void handleTestStationLocation(station)}>
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

      {(station.type === "prime" || station.type === "dip" || station.type === "wash") && (
        <div className="col-span-12 border-t border-border-ui/70 pt-2 mt-1 grid grid-cols-12 gap-2">
          <div className="col-span-3 text-xs text-content-faint self-center">
            Action
          </div>
          {station.type === "prime" && (
            <PrimeActionFields station={station} inputCls={inputCls} updateStationActionField={updateStationActionField} />
          )}
          {(station.type === "dip" || station.type === "wash") && (
            <BrushActionFields station={station} inputCls={inputCls} updateStationActionField={updateStationActionField} />
          )}
        </div>
      )}
    </div>
  );
}
