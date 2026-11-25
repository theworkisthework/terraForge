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
    await runWithIdleStatus(() => result.current.startProbing());
    for (let point = 0; point < 4; point++) {
      await runWithIdleStatus(() => result.current.recordPoint());
    }

    // The last point lifts the pen and readies the mesh, but stays on the
    // probe step until the user moves on. Nothing is saved yet.
    expect(result.current.wizardStep).toBe("probe");
    act(() => result.current.showReview());
    expect(result.current.wizardStep).toBe("review");
    expect(result.current.result?.points).toHaveLength(4);
    expect(updateConfig).not.toHaveBeenCalled();
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenLastCalledWith("G90 G21");

    await act(async () => {
      await result.current.saveResult(true);
    });
    expect(result.current.wizardStep).toBe("closed");
    expect(updateConfig).toHaveBeenCalledWith(
      config.id,
      expect.objectContaining({ bedMeshEnabled: true, bedMesh: expect.any(Object) }),
    );
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
      startPromise = result.current.startProbing();
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
    expect(result.current.wizardStep).toBe("probe");
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
      await result.current.home();
    });
    expect(result.current.originReady).toBe(true);
    await act(async () => {
      await result.current.startProbing();
    });

    expect(sendCommand.mock.calls.map(([command]) => command)).toEqual([
      "$H",
      "G91 G21 G0 Z5",
      "G90 G21",
      "G90 G21 G0 X0.000 Y0.000",
    ]);
    expect(result.current.wizardStep).toBe("probe");
    expect(result.current.error).toBeNull();
  });
  function zController() {
    const config = createMachineConfig({
      id: "mesh-machine",
      penUpCommand: "G0Z15",
      penDownCommand: "G0Z0",
    });
    return {
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
  }

  it("marks the origin ready once it is confirmed", () => {
    const { result } = renderHook(() => useBedMeshCalibration(zController()));
    expect(result.current.originReady).toBe(false);
    act(() => result.current.confirmOrigin());
    expect(result.current.originReady).toBe(true);
  });

  it("lifts the pen when probing is cancelled", async () => {
    const { result } = renderHook(() => useBedMeshCalibration(zController()));
    await runWithIdleStatus(() => result.current.startProbing());
    expect(result.current.wizardStep).toBe("probe");
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockClear();

    await runWithIdleStatus(() => result.current.cancel());

    expect(sendCommand).toHaveBeenCalledWith("G91 G21 G0 Z5");
    expect(result.current.wizardStep).toBe("closed");
  });

  it("can't calibrate when the pen commands don't move Z", () => {
    const controller = zController();
    controller.form = { ...controller.form, penUpCommand: "M3S0", penDownCommand: "M3S1" };
    const { result } = renderHook(() => useBedMeshCalibration(controller));
    expect(result.current.canCalibrate).toBe(false);
    act(() => result.current.openWizard());
    expect(result.current.wizardStep).toBe("closed");
  });
  it("lifts the pen and discards progress when jumping back from probing", async () => {
    const { result } = renderHook(() => useBedMeshCalibration(zController()));
    await runWithIdleStatus(() => result.current.startProbing());
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockClear();

    await runWithIdleStatus(() => result.current.goToStep("origin"));

    expect(sendCommand).toHaveBeenCalledWith("G91 G21 G0 Z5");
    expect(result.current.wizardStep).toBe("origin");
    expect(result.current.points).toHaveLength(0);
  });

  it("ignores jumps forward", async () => {
    const { result } = renderHook(() => useBedMeshCalibration(zController()));
    act(() => result.current.openWizard());
    await act(async () => {
      await result.current.goToStep("review");
    });
    expect(result.current.wizardStep).toBe("grid");
  });
  it("starts probing when the pen is already at the first point (no status report follows)", async () => {
    // Set Zero leaves the pen at X0 Y0, so the move to the first point changes
    // nothing and FluidNC (reporting on change only) stays silent.
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockImplementation(async (command: string) => {
      if (command.startsWith("G91")) setTimeout(() => act(() => publishIdleStatus()), 0);
    });
    const { result } = renderHook(() => useBedMeshCalibration(zController()));

    await act(async () => {
      await result.current.startProbing();
    });

    expect(sendCommand).toHaveBeenCalledWith("G90 G21 G0 X0.000 Y0.000");
    expect(result.current.error).toBeNull();
    expect(result.current.wizardStep).toBe("probe");
  });

  it("lifts the pen with a negative Z move on machines with inverted Z jog", async () => {
    const controller = zController();
    controller.form = { ...controller.form, invertZJogControls: true };
    const { result } = renderHook(() => useBedMeshCalibration(controller));
    await runWithIdleStatus(() => result.current.startProbing());
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith("G91 G21 G0 Z-5");
  });
  it("tracks the point the pen is travelling to until the machine arrives", async () => {
    const { result } = renderHook(() => useBedMeshCalibration(zController()));
    await act(async () => {
      result.current.setXPoints(2);
      result.current.setYPoints(2);
    });
    await runWithIdleStatus(() => result.current.startProbing());
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockResolvedValue(undefined); // no automatic status replies

    let recording!: Promise<void>;
    await act(async () => {
      recording = result.current.recordPoint();
      await Promise.resolve();
    });
    expect(result.current.movingTo).toBe(1);
    expect(result.current.index).toBe(0);

    await act(async () => {
      publishIdleStatus();
      await new Promise((resolve) => setTimeout(resolve, 0));
      publishIdleStatus();
      await recording;
    });
    expect(result.current.movingTo).toBeNull();
    expect(result.current.index).toBe(1);
  });

  it("reports the machine as not ready to record while it's jogging", () => {
    useMachineStore.setState({ status: { ...createMachineStatus(), state: "Jog" } });
    const controller = zController();
    (controller.machineStore as { status: unknown }).status = useMachineStore.getState().status;
    const { result } = renderHook(() => useBedMeshCalibration(controller));
    expect(result.current.machineIdle).toBe(false);
  });
});
