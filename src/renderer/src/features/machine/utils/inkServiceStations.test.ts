import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_INK_SERVICE_STATIONS, type InkServiceStation } from "../../../../../types";
import { createMachineConfig } from "../../../../../../tests/helpers/factories";
import {
  inkServiceStationsOf,
  newDipStation,
  normalizeStation,
  parseStoredStations,
  selectActiveInkServiceStations,
} from "./inkServiceStations";
import { LEGACY_INK_STATIONS_KEY, adoptLegacyInkServiceStations } from "./legacyInkServiceStations";

const dip: InkServiceStation = { id: "tray", name: "Tray", type: "dip", x: 150, y: 20, dwellMs: 300 };

describe("inkServiceStationsOf", () => {
  it("is the machine's own list", () => {
    expect(inkServiceStationsOf(createMachineConfig({ inkServiceStations: [dip] }))).toEqual([dip]);
  });

  it("is the defaults for a machine with none, an empty list, or no machine", () => {
    expect(inkServiceStationsOf(createMachineConfig())).toBe(DEFAULT_INK_SERVICE_STATIONS);
    expect(inkServiceStationsOf(createMachineConfig({ inkServiceStations: [] }))).toBe(DEFAULT_INK_SERVICE_STATIONS);
    expect(inkServiceStationsOf(undefined)).toBe(DEFAULT_INK_SERVICE_STATIONS);
  });
});

describe("selectActiveInkServiceStations", () => {
  it("follows the active machine", () => {
    const a = createMachineConfig({ id: "a", inkServiceStations: [dip] });
    const b = createMachineConfig({ id: "b" });
    expect(selectActiveInkServiceStations({ configs: [a, b], activeConfigId: "a" })).toBe(a.inkServiceStations);
    expect(selectActiveInkServiceStations({ configs: [a, b], activeConfigId: "b" })).toBe(DEFAULT_INK_SERVICE_STATIONS);
    expect(selectActiveInkServiceStations({ configs: [a, b], activeConfigId: null })).toBe(DEFAULT_INK_SERVICE_STATIONS);
  });
});

describe("normalizeStation", () => {
  it("gives a station the action of its type when it has the wrong one or none", () => {
    expect(normalizeStation(dip).action).toMatchObject({ kind: "brush-motion", pattern: "back-forth" });
    expect(normalizeStation({ ...dip, type: "prime" }).action).toMatchObject({ kind: "prime-press" });
    expect(normalizeStation({ ...dip, type: "wipe", action: { kind: "prime-press", zDepthMM: 1, pressCount: 1 } }).action).toBeUndefined();
  });

  it("keeps numbers in range", () => {
    const station = normalizeStation({
      ...dip,
      dwellMs: -10,
      action: { kind: "brush-motion", zDepthMM: -1, pattern: "circular", repetitions: 0, distanceMM: -3 },
    });
    expect(station.dwellMs).toBe(0);
    expect(station.action).toEqual({ kind: "brush-motion", zDepthMM: 0, pattern: "circular", repetitions: 1, distanceMM: 0 });
  });
});

describe("newDipStation", () => {
  it("is numbered after the dip stations there already are", () => {
    expect(newDipStation([dip, { ...dip, id: "wipe", type: "wipe" }]).name).toBe("Dip 2");
  });

  it("never takes an id already in the list", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const first = newDipStation([]);
    const second = newDipStation([first]);
    expect(second.id).not.toBe(first.id);
    vi.restoreAllMocks();
  });
});

describe("parseStoredStations", () => {
  it("keeps the usable stations and drops the rest", () => {
    expect(parseStoredStations([dip, null, "x", { id: "bad" }, { ...dip, id: "b", x: "12" }, { ...dip, id: "c", type: "soak" }])).toEqual([
      normalizeStation(dip),
    ]);
  });

  it("is null for anything that is not a list", () => {
    expect(parseStoredStations(undefined)).toBeNull();
    expect(parseStoredStations({ stations: [] })).toBeNull();
  });
});

describe("adoptLegacyInkServiceStations", () => {
  const saveConfigs = () => window.terraForge.fs.saveConfigs as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    saveConfigs().mockReset();
    saveConfigs().mockResolvedValue(undefined);
  });

  it("does nothing when no old list was set aside", async () => {
    const configs = [createMachineConfig()];
    expect(await adoptLegacyInkServiceStations(configs)).toBe(configs);
    expect(saveConfigs()).not.toHaveBeenCalled();
  });

  it("gives the old list to every machine without stations of its own, and saves", async () => {
    localStorage.setItem(LEGACY_INK_STATIONS_KEY, JSON.stringify([dip]));
    const own: InkServiceStation = { ...dip, id: "own", x: 5 };
    const configs = [
      createMachineConfig({ id: "a" }),
      createMachineConfig({ id: "b", inkServiceStations: [own] }),
      createMachineConfig({ id: "c" }),
    ];

    const adopted = await adoptLegacyInkServiceStations(configs);

    expect(adopted.map((c) => c.inkServiceStations?.[0].id)).toEqual(["tray", "own", "tray"]);
    expect(adopted[0].inkServiceStations?.[0]).toMatchObject({ x: 150, y: 20 });
    // Each machine has its own copy to edit.
    expect(adopted[0].inkServiceStations).not.toBe(adopted[2].inkServiceStations);
    expect(saveConfigs()).toHaveBeenCalledWith(adopted);
    expect(localStorage.getItem(LEGACY_INK_STATIONS_KEY)).toBeNull();
  });

  it("keeps the old list for another try when the configs could not be saved", async () => {
    localStorage.setItem(LEGACY_INK_STATIONS_KEY, JSON.stringify([dip]));
    saveConfigs().mockRejectedValue(new Error("disk full"));

    const adopted = await adoptLegacyInkServiceStations([createMachineConfig({ id: "a" })]);

    // Still used for this session.
    expect(adopted[0].inkServiceStations?.[0].id).toBe("tray");
    expect(localStorage.getItem(LEGACY_INK_STATIONS_KEY)).not.toBeNull();
  });

  it("keeps the old list until there is a machine to give it to", async () => {
    localStorage.setItem(LEGACY_INK_STATIONS_KEY, JSON.stringify([dip]));
    expect(await adoptLegacyInkServiceStations([])).toEqual([]);
    expect(localStorage.getItem(LEGACY_INK_STATIONS_KEY)).not.toBeNull();
    expect(saveConfigs()).not.toHaveBeenCalled();
  });

  it("discards an old list with nothing usable in it", async () => {
    for (const stored of ["{broken", JSON.stringify("nope"), JSON.stringify([{ id: 1 }])]) {
      localStorage.setItem(LEGACY_INK_STATIONS_KEY, stored);
      const configs = [createMachineConfig()];
      expect(await adoptLegacyInkServiceStations(configs)).toBe(configs);
      expect(localStorage.getItem(LEGACY_INK_STATIONS_KEY)).toBeNull();
    }
    expect(saveConfigs()).not.toHaveBeenCalled();
  });
});
