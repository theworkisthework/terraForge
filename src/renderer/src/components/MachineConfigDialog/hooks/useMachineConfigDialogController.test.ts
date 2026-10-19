import { afterEach, describe, expect, it, vi } from "vitest";
import { importSummary, inkStationActions } from "./useMachineConfigDialogController";
import { createMachineConfig } from "../../../../../../tests/helpers/factories";

const station = { id: "dip", name: "Dip", type: "dip" as const, x: 12.3456, y: 7, dwellMs: 100 };

function setup(overrides: { connected?: boolean; activeConfigId?: string | null; sendCommand?: () => Promise<unknown> } = {}) {
  const updateInkServiceStation = vi.fn();
  const setAlertInfo = vi.fn();
  const sendCommand = vi.fn(overrides.sendCommand ?? (() => Promise.resolve()));
  vi.stubGlobal("terraForge", { fluidnc: { sendCommand } });
  const config = createMachineConfig({ id: "m1", penUpCommand: "M3S0" });
  const actions = inkStationActions({
    appConfig: { updateInkServiceStation } as never,
    connected: overrides.connected ?? true,
    configs: [config],
    activeConfigId: overrides.activeConfigId === undefined ? "m1" : overrides.activeConfigId,
    setAlertInfo,
  });
  return { actions, updateInkServiceStation, setAlertInfo, sendCommand };
}

afterEach(() => vi.unstubAllGlobals());

describe("ink station actions", () => {
  it("updates one field of a station", () => {
    const { actions, updateInkServiceStation } = setup();
    actions.updateStationField("dip", "x", 40);
    expect(updateInkServiceStation).toHaveBeenCalledWith("dip", { x: 40 });
  });

  it("applies an action edit on top of the station's action, or its type's default", () => {
    const { actions, updateInkServiceStation } = setup();
    actions.updateStationActionField(station, { kind: "brush-motion", repetitions: 5 });
    const { action } = updateInkServiceStation.mock.calls[0][1];
    expect(action).toMatchObject({ kind: "brush-motion", repetitions: 5 });
    expect(action.pattern).toBeDefined(); // filled from the dip default
  });

  it("lifts the pen and moves to the station to test its location", async () => {
    const { actions, sendCommand } = setup();
    await actions.handleTestStationLocation(station);
    expect(sendCommand.mock.calls).toEqual([["M3S0"], ["G0 X12.346 Y7.000"]]);
  });

  it("explains why it cannot test: offline, no active machine, or a failed command", async () => {
    const offline = setup({ connected: false });
    await offline.actions.handleTestStationLocation(station);
    expect(offline.setAlertInfo).toHaveBeenCalledWith(expect.objectContaining({ title: "Machine Offline" }));
    expect(offline.sendCommand).not.toHaveBeenCalled();

    const noMachine = setup({ activeConfigId: null });
    await noMachine.actions.handleTestStationLocation(station);
    expect(noMachine.setAlertInfo).toHaveBeenCalledWith(expect.objectContaining({ title: "No Active Machine" }));

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
