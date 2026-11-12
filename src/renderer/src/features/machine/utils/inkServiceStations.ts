/**
 * Ink service stations — where a pen is primed and wiped, a brush dipped
 * and washed. Their positions are machine coordinates, so each machine
 * config holds its own list.
 */
import {
  DEFAULT_INK_SERVICE_STATIONS,
  type InkServiceStation,
  type InkServiceStationAction,
  type InkServiceStationType,
  type MachineConfig,
} from "../../../../../types";

const STATION_TYPES: readonly InkServiceStationType[] = ["prime", "wipe", "dip", "wash"];

/** A machine's stations: its own, or the defaults if it has none. */
export function inkServiceStationsOf(
  config: Pick<MachineConfig, "inkServiceStations"> | null | undefined,
): InkServiceStation[] {
  const stations = config?.inkServiceStations;
  return stations && stations.length > 0 ? stations : DEFAULT_INK_SERVICE_STATIONS;
}

/** The stations of the active machine. For `useMachineStore`. */
export const selectActiveInkServiceStations = (state: {
  configs: MachineConfig[];
  activeConfigId: string | null;
}): InkServiceStation[] => inkServiceStationsOf(state.configs.find((config) => config.id === state.activeConfigId));

/** The motion a station of this type performs unless told otherwise. */
export function defaultStationActionForType(type: InkServiceStationType): InkServiceStationAction | undefined {
  if (type === "prime") {
    return { kind: "prime-press", zDepthMM: 1, pressCount: 3 };
  }
  if (type === "dip" || type === "wash") {
    return {
      kind: "brush-motion",
      zDepthMM: 2,
      pattern: type === "wash" ? "circular" : "back-forth",
      repetitions: 3,
      distanceMM: 2,
    };
  }
  return undefined;
}

/** A station with its numbers in range and an action that fits its type. */
export function normalizeStation(station: InkServiceStation): InkServiceStation {
  const dwellMs = Math.max(0, Number(station.dwellMs) || 0);
  let action = station.action;

  if (station.type === "prime") {
    action =
      action?.kind === "prime-press"
        ? {
            kind: "prime-press",
            zDepthMM: Math.max(0, Number(action.zDepthMM) || 0),
            pressCount: Math.max(1, Math.round(Number(action.pressCount) || 1)),
          }
        : defaultStationActionForType(station.type);
  } else if (station.type === "dip" || station.type === "wash") {
    action =
      action?.kind === "brush-motion"
        ? {
            kind: "brush-motion",
            zDepthMM: Math.max(0, Number(action.zDepthMM) || 0),
            pattern: action.pattern,
            repetitions: Math.max(1, Math.round(Number(action.repetitions) || 1)),
            distanceMM: Math.max(0, Number(action.distanceMM) || 0),
          }
        : defaultStationActionForType(station.type);
  } else {
    action = undefined;
  }

  return { ...station, dwellMs, action };
}

/** A dip station to add to `stations`, named after how many it has already. */
export function newDipStation(stations: InkServiceStation[]): InkServiceStation {
  const taken = new Set(stations.map((station) => station.id));
  let id = `dip-${Date.now()}`;
  for (let n = 2; taken.has(id); n++) id = `dip-${Date.now()}-${n}`;
  return {
    id,
    name: `Dip ${stations.filter((station) => station.type === "dip").length + 1}`,
    type: "dip",
    x: 0,
    y: 0,
    dwellMs: 500,
    action: defaultStationActionForType("dip"),
    enabled: true,
  };
}

/**
 * Stations read from storage that this app did not just write: the usable
 * ones, normalised, or null if `value` is not a list of stations at all.
 */
export function parseStoredStations(value: unknown): InkServiceStation[] | null {
  if (!Array.isArray(value)) return null;
  const stations = value.filter(
    (item): item is InkServiceStation =>
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      STATION_TYPES.includes(item.type) &&
      Number.isFinite(item.x) &&
      Number.isFinite(item.y),
  );
  return stations.map(normalizeStation);
}
