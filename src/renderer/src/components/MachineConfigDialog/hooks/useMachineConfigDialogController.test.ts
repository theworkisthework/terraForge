import { afterEach, describe, expect, it, vi } from "vitest";
import { importSummary, inkStationActions } from "./useMachineConfigDialogController";
import { createMachineConfig } from "../../../../../../tests/helpers/factories";

const station = { id: "dip", name: "Dip", type: "dip" as const, x: 12.3456, y: 7, dwellMs: 100 };
const wipe = { id: "wipe", name: "Wipe", type: "wipe" as const, x: 1, y: 2, dwellMs: 0 };

function setup(overrides: { machine?: { penUpCommand: string } | null; sendCommand?: () => Promise<unknown> } = {}) {
  const setStations = vi.fn();
  const setAlertInfo = vi.fn();
  const sendCommand = vi.fn(overrides.sendCommand ?? (() => Promise.resolve()));
  vi.stubGlobal("terraForge", { fluidnc: { sendCommand } });
  const actions = inkStationActions({
    stations: [station, wipe],
    setStations,
    machine: overrides.machine === undefined ? createMachineConfig({ id: "m1", penUpCommand: "M3S0" }) : overrides.machine,
    setAlertInfo,
  });
  /** The station list the last edit produced. */
  const result = () => setStations.mock.calls.at(-1)?.[0] as (typeof station)[];
  return { actions, setStations, result, setAlertInfo, sendCommand };
}

afterEach(() => vi.unstubAllGlobals());

describe("ink station actions", () => {
  it("updates one field of a station, leaving the others as they were", () => {
    const { actions, result } = setup();
    actions.updateStationField("dip", "x", 40);
    expect(result()[0]).toMatchObject({ id: "dip", x: 40, y: 7 });
    expect(result()[1]).toBe(wipe);
  });

  it("keeps an edited station's numbers in range", () => {
    const { actions, result } = setup();
    actions.updateStationField("dip", "dwellMs", -5);
    expect(result()[0].dwellMs).toBe(0);
  });

  it("applies an action edit on top of the station's action, or its type's default", () => {
    const { actions, result } = setup();
    actions.updateStationActionField(station, { kind: "brush-motion", repetitions: 5 });
    const { action } = result()[0] as { action?: { pattern?: string } };
    expect(action).toMatchObject({ kind: "brush-motion", repetitions: 5 });
    expect(action?.pattern).toBeDefined(); // filled from the dip default
  });

  it("adds a dip station with an id of its own", () => {
    const { actions, result } = setup();
    actions.addStation();
    expect(result()).toHaveLength(3);
    expect(result()[2]).toMatchObject({ type: "dip", name: "Dip 2", enabled: true });
    expect(new Set(result().map((s) => s.id)).size).toBe(3);
  });

  it("removes a station", () => {
    const { actions, result } = setup();
    actions.removeStation("dip");
    expect(result()).toEqual([wipe]);
  });

  it("lifts the pen and moves to the station to test its location", async () => {
    const { actions, sendCommand } = setup();
    await actions.handleTestStationLocation(station);
    expect(sendCommand.mock.calls).toEqual([["M3S0"], ["G0 X12.346 Y7.000"]]);
  });

  it("explains why it cannot test: not connected to this machine, or a failed command", async () => {
    const offline = setup({ machine: null });
    await offline.actions.handleTestStationLocation(station);
    expect(offline.setAlertInfo).toHaveBeenCalledWith(expect.objectContaining({ title: "Machine Offline" }));
    expect(offline.sendCommand).not.toHaveBeenCalled();

    const failing = setup({ sendCommand: () => Promise.reject(new Error("busy")) });
    await failing.actions.handleTestStationLocation(station);
    expect(failing.setAlertInfo).toHaveBeenCalledWith({ title: "Station Test Failed", message: "busy" });
  });
});

describe("importSummary", () => {
  it("counts what came in and what was skipped", () => {
    expect(importSummary({ added: 1, skipped: 0 })).toBe("1 config imported.");
    expect(importSummary({ added: 2, skipped: 3 })).toBe("2 configs imported • 3 skipped (already exist by ID or name).");
  });
});
