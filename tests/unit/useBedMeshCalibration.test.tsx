import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBedMeshCalibration } from "../../src/renderer/src/components/MachineConfigDialog/components/Machine/useBedMeshCalibration";
import type { MachineConfigDialogController } from "../../src/renderer/src/components/MachineConfigDialog/hooks/useMachineConfigDialogController";
import { useMachineStore } from "../../src/renderer/src/store/machineStore";
import { createMachineConfig, createMachineStatus } from "../helpers/factories";

function publishIdleStatus() {
  const status = createMachineStatus();
  useMachineStore.getState().setStatus(status);
}

describe("useBedMeshCalibration", () => {
  beforeEach(() => {
    const config = createMachineConfig({ id: "mesh-machine" });
    useMachineStore.setState({
      connected: true,
      activeConfigId: config.id,
      status: createMachineStatus(),
    });
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockReset();
    sendCommand.mockImplementation(async () => {
      setTimeout(() => {
        act(() => {
          publishIdleStatus();
          publishIdleStatus();
        });
      }, 0);
    });
  });

  async function runWithIdleStatus(action: () => Promise<void>) {
    await act(async () => {
      const operation = action();
      publishIdleStatus();
      publishIdleStatus();
      await operation;
    });
  }

  it("raises Z only for the first XY setup jog and uses streamed status instead of getStatus", async () => {
    const config = createMachineConfig({
      id: "mesh-machine",
      penUpCommand: "G0Z15",
      penDownCommand: "G0Z0",
    });
    const controller = {
      form: config,
      change: vi.fn(),
      inputCls: "",
      selectedId: config.id,
      machineStore: {
        connected: true,
        activeConfigId: config.id,
        status: createMachineStatus(),
        updateConfig: vi.fn(),
      },
    } as unknown as MachineConfigDialogController;
    const { result } = renderHook(() => useBedMeshCalibration(controller));

    await act(async () => {
      const firstJog = result.current.jogXY("X", 1);
      publishIdleStatus();
      publishIdleStatus();
      await firstJog;
    });
    await act(async () => {
      const secondJog = result.current.jogXY("Y", -1);
      publishIdleStatus();
      publishIdleStatus();
      await secondJog;
    });

    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenNthCalledWith(1, "G91 G21 G0 Z5");
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenNthCalledWith(2, "G90 G21");
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenNthCalledWith(
      3,
      "$J=G91 G21 X1.000 F3000",
    );
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenNthCalledWith(
      4,
      "$J=G91 G21 Y-1.000 F3000",
    );
  });

  it("uses settled status-stream updates after Z jogs", async () => {
    const config = createMachineConfig({
      id: "mesh-machine",
      penUpCommand: "G0Z15",
      penDownCommand: "G0Z0",
    });
    const controller = {
      form: config,
      change: vi.fn(),
      inputCls: "",
      selectedId: config.id,
      machineStore: {
        connected: true,
        activeConfigId: config.id,
        status: createMachineStatus(),
        updateConfig: vi.fn(),
      },
    } as unknown as MachineConfigDialogController;
    const { result } = renderHook(() => useBedMeshCalibration(controller));

    await act(async () => {
      const jog = result.current.jogZ(0.1);
      publishIdleStatus();
      publishIdleStatus();
      await jog;
    });

    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      "$J=G91 G21 Z0.100 F3000",
    );
  });

  it("waits for the final retract before saving a completed mesh", async () => {
    const config = createMachineConfig({
      id: "mesh-machine",
      penUpCommand: "G0Z15",
      penDownCommand: "G0Z0",
    });
    const updateConfig = vi.fn().mockResolvedValue(undefined);
    const controller = {
      form: config,
      change: vi.fn(),
      inputCls: "",
      selectedId: config.id,
      machineStore: {
        connected: true,
        activeConfigId: config.id,
        status: createMachineStatus(),
        updateConfig,
      },
    } as unknown as MachineConfigDialogController;
    const { result } = renderHook(() => useBedMeshCalibration(controller));

    await act(async () => {
      result.current.setXPoints(2);
      result.current.setYPoints(2);
    });
    await runWithIdleStatus(() => result.current.startCalibration("known"));
    for (let point = 0; point < 4; point++) {
      await runWithIdleStatus(() => result.current.next());
    }

    expect(result.current.open).toBe(false);
    expect(updateConfig).toHaveBeenCalledWith(
      config.id,
      expect.objectContaining({ bedMeshEnabled: false, bedMesh: expect.any(Object) }),
    );
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenLastCalledWith("G90 G21");
  });

  it("starts the retract immediately when an idle status is already available", async () => {
    const config = createMachineConfig({
      id: "mesh-machine",
      penUpCommand: "G0Z15",
      penDownCommand: "G0Z0",
    });
    const controller = {
      form: config,
      change: vi.fn(),
      inputCls: "",
      selectedId: config.id,
      machineStore: {
        connected: true,
        activeConfigId: config.id,
        status: createMachineStatus(),
        updateConfig: vi.fn(),
      },
    } as unknown as MachineConfigDialogController;
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockResolvedValue(undefined);
    const { result } = renderHook(() => useBedMeshCalibration(controller));
    let startPromise!: Promise<void>;

    await act(async () => {
      startPromise = result.current.startCalibration("known");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sendCommand).toHaveBeenNthCalledWith(1, "G91 G21 G0 Z5");
    expect(sendCommand).toHaveBeenNthCalledWith(2, "G90 G21");

    await act(async () => {
      publishIdleStatus();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sendCommand).toHaveBeenCalledWith("G90 G21 G0 X0.000 Y0.000");

    await act(async () => {
      publishIdleStatus();
      await startPromise;
    });
    expect(result.current.open).toBe(true);
  });

  it("catches idle status updates emitted before motion commands resolve", async () => {
    const config = createMachineConfig({
      id: "mesh-machine",
      penUpCommand: "G0Z15",
      penDownCommand: "G0Z0",
    });
    const controller = {
      form: config,
      change: vi.fn(),
      inputCls: "",
      selectedId: config.id,
      machineStore: {
        connected: true,
        activeConfigId: config.id,
        status: createMachineStatus(),
        updateConfig: vi.fn(),
      },
    } as unknown as MachineConfigDialogController;
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockImplementation(async () => {
      act(() => publishIdleStatus());
    });
    const { result } = renderHook(() => useBedMeshCalibration(controller));

    await act(async () => {
      await result.current.startCalibration("home");
    });

    expect(sendCommand.mock.calls.map(([command]) => command)).toEqual([
      "$H",
      "G91 G21 G0 Z5",
      "G90 G21",
      "G90 G21 G0 X0.000 Y0.000",
    ]);
    expect(result.current.open).toBe(true);
    expect(result.current.error).toBeNull();
  });
});
