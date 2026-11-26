import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  serpentineIndex,
  useBedMeshCalibration,
} from "../../src/renderer/src/components/MachineConfigDialog/components/Machine/useBedMeshCalibration";
import type { MachineConfigDialogController } from "../../src/renderer/src/components/MachineConfigDialog/hooks/useMachineConfigDialogController";
import { useMachineStore } from "../../src/renderer/src/store/machineStore";
import { createMachineConfig, createMachineStatus } from "../helpers/factories";

function publishIdleStatus() {
  const status = createMachineStatus();
  useMachineStore.getState().setStatus(status);
}

/** An Idle report with the pen at machine Z `z`. */
function publishIdleAt(z: number) {
  const status = createMachineStatus();
  useMachineStore.getState().setStatus({
    ...status,
    raw: `<Idle|MPos:${status.mpos.x.toFixed(3)},${status.mpos.y.toFixed(3)},${z.toFixed(3)}|FS:0,0>`,
    mpos: { ...status.mpos, z },
  });
}

/** The reports a homing cycle produces: Home, then Idle at the home position. */
function publishHomingCycle() {
  useMachineStore.getState().setStatus(createMachineStatus({ state: "Home" }));
  publishIdleStatus();
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
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenLastCalledWith("G21 G53 G0 Z5.000");

    await act(async () => {
      await result.current.saveResult(true);
    });
    expect(result.current.wizardStep).toBe("closed");
    expect(updateConfig).toHaveBeenCalledWith(
      config.id,
      expect.objectContaining({ bedMeshEnabled: true, bedMesh: expect.any(Object) }),
    );
  });

  it("goes straight to the first point at the pen's current height", async () => {
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

    // No lift first: the origin step had the user raise the pen clear, and
    // a blind lift from an already-high pen can hit the top of the Z axis.
    expect(sendCommand).toHaveBeenNthCalledWith(1, "G90 G21 G1 X0.000 Y0.000 F3000");

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
    sendCommand.mockImplementation(async (command: string) => {
      act(() => (command === "$H" ? publishHomingCycle() : publishIdleStatus()));
    });
    const { result } = renderHook(() => useBedMeshCalibration(controller));

    await act(async () => {
      await result.current.home();
    });
    // No work offset has been reported, so where X0 Y0 is can't be told.
    expect(result.current.homeCheck).toEqual({ kind: "unknown" });
    expect(result.current.originReady).toBe(false);
    await act(async () => {
      await result.current.startProbing();
    });

    expect(sendCommand.mock.calls.map(([command]) => command)).toEqual([
      "$H",
      "?", // the end of homing may not be reported, so it asks
      "G90 G21 G1 X0.000 Y0.000 F3000",
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
    act(() => publishIdleAt(-3)); // the user lowered the pen to the bed

    await runWithIdleStatus(() => result.current.cancel());

    // Back up to the height probing started from (Z0 here).
    expect(sendCommand).toHaveBeenCalledWith("G21 G53 G0 Z0.000");
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
    act(() => publishIdleAt(-3)); // the user lowered the pen to the bed

    await runWithIdleStatus(() => result.current.goToStep("origin"));

    expect(sendCommand).toHaveBeenCalledWith("G21 G53 G0 Z0.000");
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
    sendCommand.mockImplementation(async () => {});
    const { result } = renderHook(() => useBedMeshCalibration(zController()));

    await act(async () => {
      await result.current.startProbing();
    });

    expect(sendCommand).toHaveBeenCalledWith("G90 G21 G1 X0.000 Y0.000 F3000");
    expect(result.current.error).toBeNull();
    expect(result.current.wizardStep).toBe("probe");
  });

  // Travel height is absolute (5 mm above the first touch), so recording
  // points without lowering the pen doesn't make it climb 5 mm every move.
  it("doesn't keep lifting the pen when it wasn't lowered between points", async () => {
    let z = 0;
    const publishAt = (zNow: number) => {
      const status = createMachineStatus();
      useMachineStore.getState().setStatus({
        ...status,
        raw: `<Idle|MPos:0.000,0.000,${zNow.toFixed(3)}|FS:0,0>`,
        mpos: { ...status.mpos, z: zNow },
      });
    };
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockImplementation(async (command: string) => {
      const lift = command.match(/G53 G0 Z(-?[\d.]+)/);
      if (lift) z = Number(lift[1]);
      setTimeout(() => act(() => publishAt(z)), 0);
    });
    useMachineStore.setState({ status: createMachineStatus() });
    const { result } = renderHook(() => useBedMeshCalibration(zController()));
    await act(async () => {
      result.current.setXPoints(2);
      result.current.setYPoints(2);
    });
    await act(async () => {
      await result.current.startProbing();
    });
    // Before any touch: no lift, the pen travels at its current height.
    expect(sendCommand.mock.calls.some(([c]) => String(c).includes("G53"))).toBe(false);

    // The user lowers the pen to the bed (Z0) and records the first point.
    z = 0;
    act(() => publishAt(0));
    sendCommand.mockClear();
    await act(async () => {
      await result.current.recordPoint();
    });
    expect(sendCommand).toHaveBeenCalledWith("G21 G53 G0 Z5.000");

    // Now records twice without lowering it: the pen is already at travel
    // height, so it isn't lifted again.
    for (let i = 0; i < 2; i++) {
      sendCommand.mockClear();
      await act(async () => {
        await result.current.recordPoint();
      });
      expect(sendCommand.mock.calls.some(([c]) => String(c).includes("G53"))).toBe(false);
    }
    expect(z).toBe(5);
  });

  it("maps probe steps to grid indices in an S, and back", () => {
    // 3 × 3: row 0 left→right, row 1 right→left, row 2 left→right.
    const order = Array.from({ length: 9 }, (_, step) => serpentineIndex(step, 3));
    expect(order).toEqual([0, 1, 2, 5, 4, 3, 6, 7, 8]);
    for (let i = 0; i < 9; i++) expect(serpentineIndex(serpentineIndex(i, 3), 3)).toBe(i);
  });

  it("probes in an S but stores each reading at its grid position", async () => {
    let z = 0;
    const publishAt = (zNow: number) => {
      const status = createMachineStatus();
      useMachineStore.getState().setStatus({
        ...status,
        raw: `<Idle|MPos:0.000,0.000,${zNow.toFixed(3)}|FS:0,0>`,
        mpos: { ...status.mpos, z: zNow },
      });
    };
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockImplementation(async (command: string) => {
      const lift = command.match(/G53 G0 Z(-?[\d.]+)/);
      if (lift) z = Number(lift[1]);
      setTimeout(() => act(() => publishAt(z)), 0);
    });
    const controller = zController();
    controller.form = { ...controller.form, bedWidth: 200, bedHeight: 100, origin: "bottom-left" };
    const { result } = renderHook(() => useBedMeshCalibration(controller));
    await act(async () => {
      result.current.setXPoints(3);
      result.current.setYPoints(2);
    });
    await act(async () => {
      await result.current.startProbing();
    });
    // At each step the pen touches at a height that says which step it was.
    for (let step = 0; step < 6; step++) {
      z = -step / 10;
      act(() => publishAt(z));
      await act(async () => {
        await result.current.recordPoint();
      });
    }

    const visits = sendCommand.mock.calls
      .map(([c]) => String(c).match(/X(-?[\d.]+) Y(-?[\d.]+)/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => `${Number(m[1])},${Number(m[2])}`);
    expect(visits).toEqual(["0,0", "100,0", "200,0", "200,100", "100,100", "0,100"]);

    // Stored row by row, left to right; step k touched at -k/10.
    const zs = result.current.result!.points.map((p) => Number(p.z.toFixed(1)));
    expect(zs).toEqual([0, -0.1, -0.2, -0.5, -0.4, -0.3]);
  });

  it("lifts the pen with a negative Z move on machines with inverted Z jog", async () => {
    const controller = zController();
    controller.form = { ...controller.form, invertZJogControls: true };
    const { result } = renderHook(() => useBedMeshCalibration(controller));
    await act(async () => {
      result.current.setXPoints(2);
      result.current.setYPoints(2);
    });
    await runWithIdleStatus(() => result.current.startProbing());
    await runWithIdleStatus(() => result.current.recordPoint()); // touched at Z0
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith("G21 G53 G0 Z-5.000");
  });

  // FluidNC 4.1 refuses HTTP commands while the machine moves, so the lift is
  // one absolute line from the current machine Z, not G91 + a G90 restore.
  it("lifts the pen with a single absolute move above the first touch", async () => {
    act(() => publishIdleAt(-12.25));
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockImplementation(async () => {
      setTimeout(() => act(() => publishIdleAt(-12.25)), 0);
    });
    const { result } = renderHook(() => useBedMeshCalibration(zController()));
    await act(async () => {
      result.current.setXPoints(2);
      result.current.setYPoints(2);
    });
    await act(async () => {
      await result.current.startProbing();
    });
    sendCommand.mockClear();
    await act(async () => {
      await result.current.recordPoint(); // touched at -12.25
    });
    expect(sendCommand.mock.calls[0]).toEqual(["G21 G53 G0 Z-7.250"]);
  });

  it("doesn't lift a pen that's already above the start height when cancelled", async () => {
    const { result } = renderHook(() => useBedMeshCalibration(zController()));
    await runWithIdleStatus(() => result.current.startProbing()); // started at Z0
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockClear();
    act(() => publishIdleAt(4)); // the user raised it further

    await act(async () => {
      await result.current.cancel();
    });

    expect(sendCommand.mock.calls.some(([c]) => String(c).includes("G53"))).toBe(false);
    expect(result.current.wizardStep).toBe("closed");
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
    // The reading is stored and the target advanced before the move.
    expect(result.current.movingTo).toBe(1);
    expect(result.current.index).toBe(1);
    expect(result.current.atPoint).toBe(false);

    await act(async () => {
      publishIdleStatus();
      await new Promise((resolve) => setTimeout(resolve, 0));
      publishIdleStatus();
      await recording;
    });
    expect(result.current.movingTo).toBeNull();
    expect(result.current.index).toBe(1);
    expect(result.current.atPoint).toBe(true);
  });

  it("reports the machine as not ready to record while it's jogging", () => {
    useMachineStore.setState({ status: { ...createMachineStatus(), state: "Jog" } });
    const controller = zController();
    (controller.machineStore as { status: unknown }).status = useMachineStore.getState().status;
    const { result } = renderHook(() => useBedMeshCalibration(controller));
    expect(result.current.machineIdle).toBe(false);
  });
  describe("after homing", () => {
    /** A controller whose status stream has reported the given work offset. */
    function controllerWithWco(wco: string) {
      const controller = zController();
      (controller.machineStore as { status: unknown }).status = createMachineStatus({
        raw: `<Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:${wco}>`,
      });
      return controller;
    }

    async function homeWith(controller: MachineConfigDialogController) {
      const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
      sendCommand.mockImplementation(async () => {
        act(() => publishHomingCycle());
      });
      const { result } = renderHook(() => useBedMeshCalibration(controller));
      await act(async () => {
        await result.current.home();
      });
      return result;
    }

    // FluidNC 4.1: an Idle report from where the machine was parked (the last
    // probe point) arrives after $H is accepted but before homing starts.
    it("ignores an Idle report from before the homing cycle started", async () => {
      const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
      sendCommand.mockImplementation(async () => {
        setTimeout(() => act(() => {
          useMachineStore.getState().setStatus(createMachineStatus({
            raw: "<Idle|MPos:594.000,420.000,20.000|FS:0,0>",
            mpos: { x: 594, y: 420, z: 20 },
          }));
        }), 0);
        setTimeout(() => act(() => publishHomingCycle()), 5);
      });
      const { result } = renderHook(() =>
        useBedMeshCalibration(controllerWithWco("0.000,0.000,26.962")),
      );
      await act(async () => {
        await result.current.home();
      });
      expect(result.current.error).toBeNull();
      expect(result.current.homeCheck).toEqual({ kind: "at-home" });
    });

    // Homing a machine already at home on 4.1: no status report at all, just
    // the reply, held until the cycle ends.
    it("finishes on the Homed message when no status report arrives", async () => {
      const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
      sendCommand.mockResolvedValue("[MSG:Homed:XY]\nok\n");
      const { result } = renderHook(() =>
        useBedMeshCalibration(controllerWithWco("0.000,0.000,26.962")),
      );
      await act(async () => {
        await result.current.home();
      });
      expect(result.current.error).toBeNull();
      expect(result.current.homeCheck).toEqual({ kind: "at-home" });
    });

    it("finishes on a Homed message on the console", async () => {
      const onConsole = window.terraForge.fluidnc.onConsoleMessage as ReturnType<typeof vi.fn>;
      let listener: (message: string) => void = () => {};
      onConsole.mockImplementationOnce((cb: (message: string) => void) => {
        listener = cb;
        return () => {};
      });
      const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
      sendCommand.mockImplementation(async () => {
        setTimeout(() => listener("[MSG:Homed:XY]"), 5);
        return "ok";
      });
      const { result } = renderHook(() =>
        useBedMeshCalibration(controllerWithWco("0.000,0.000,26.962")),
      );
      await act(async () => {
        await result.current.home();
      });
      expect(result.current.homeCheck).toEqual({ kind: "at-home" });
    });

    it("reports a homing alarm", async () => {
      const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
      sendCommand.mockResolvedValue("ALARM:9\n");
      const { result } = renderHook(() =>
        useBedMeshCalibration(controllerWithWco("0.000,0.000,26.962")),
      );
      await act(async () => {
        await result.current.home();
      });
      expect(result.current.error).toMatch(/ALARM:9/);
      expect(result.current.homeCheck).toBeNull();
    });

    // A stale report (e.g. one lost in a multi-line frame) can say the
    // machine is still moving after it has stopped.
    it("asks for a fresh status when the last report isn't Idle", async () => {
      useMachineStore.setState({ status: createMachineStatus({ state: "Run" }) });
      const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
      sendCommand.mockImplementation(async (command: string) => {
        if (command === "?") act(() => publishIdleStatus());
        return command === "$H" ? "[MSG:Homed:XY]\nok\n" : "";
      });
      const { result } = renderHook(() =>
        useBedMeshCalibration(controllerWithWco("0.000,0.000,26.962")),
      );
      await act(async () => {
        await result.current.home();
      });
      expect(sendCommand.mock.calls[0]).toEqual(["?"]);
      expect(result.current.error).toBeNull();
      expect(result.current.homeCheck).toEqual({ kind: "at-home" });
    });

    // A machine with end stops starts up in Alarm until it's homed.
    it("homes from Alarm", async () => {
      useMachineStore.setState({ status: createMachineStatus({ state: "Alarm" }) });
      const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
      sendCommand.mockImplementation(async (command: string) => {
        if (command === "?") act(() => publishIdleStatus());
        return command === "$H" ? "[MSG:Homed:XY]\nok\n" : "";
      });
      const { result } = renderHook(() =>
        useBedMeshCalibration(controllerWithWco("0.000,0.000,26.962")),
      );
      await act(async () => {
        await result.current.home();
      });
      expect(sendCommand.mock.calls[0]).toEqual(["$H"]);
      expect(result.current.error).toBeNull();
      expect(result.current.homeCheck).toEqual({ kind: "at-home" });
    });

    it("homes when the last report is a leftover Home", async () => {
      useMachineStore.setState({ status: createMachineStatus({ state: "Home" }) });
      const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
      sendCommand.mockImplementation(async (command: string) => {
        if (command === "?") act(() => publishIdleStatus());
        return command === "$H" ? "[MSG:Homed:XY]\nok\n" : "";
      });
      const { result } = renderHook(() =>
        useBedMeshCalibration(controllerWithWco("0.000,0.000,26.962")),
      );
      await act(async () => {
        await result.current.home();
      });
      expect(sendCommand.mock.calls[0]).toEqual(["$H"]);
      expect(result.current.homeCheck).toEqual({ kind: "at-home" });
    });

    it("won't home while the machine reports it's moving", async () => {
      useMachineStore.setState({ status: createMachineStatus({ state: "Jog" }) });
      const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
      sendCommand.mockResolvedValue(""); // "?" brings no newer report
      const { result } = renderHook(() =>
        useBedMeshCalibration(controllerWithWco("0.000,0.000,26.962")),
      );
      await act(async () => {
        await result.current.home();
      });
      expect(sendCommand).not.toHaveBeenCalledWith("$H");
      expect(result.current.error).toMatch(/reports Jog/);
    });

    // FluidNC 4.1 may hold the HTTP reply until the cycle ends.
    it("carries on when the $H reply times out but the machine is homing", async () => {
      const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
      sendCommand.mockImplementation(async () => {
        act(() => useMachineStore.getState().setStatus(createMachineStatus({ state: "Home" })));
        setTimeout(() => act(() => publishIdleStatus()), 5);
        throw new Error("Error invoking remote method 'fluidnc:sendCommand': TimeoutError: The operation timed out");
      });
      const { result } = renderHook(() =>
        useBedMeshCalibration(controllerWithWco("0.000,0.000,26.962")),
      );
      await act(async () => {
        await result.current.home();
      });
      expect(result.current.error).toBeNull();
      expect(result.current.homeCheck).toEqual({ kind: "at-home" });
    });

    it("is ready when X0 Y0 is the homed position", async () => {
      const result = await homeWith(controllerWithWco("0.000,0.000,26.962"));
      expect(result.current.homeCheck).toEqual({ kind: "at-home" });
      expect(result.current.originReady).toBe(true);
    });

    it("isn't ready when X0 Y0 is somewhere else, and says where", async () => {
      const result = await homeWith(controllerWithWco("120.000,-35.000,0.000"));
      expect(result.current.homeCheck).toEqual({ kind: "offset", dx: 120, dy: -35 });
      expect(result.current.originReady).toBe(false);
    });

    it("can set X0 Y0 at the homed position", async () => {
      const result = await homeWith(controllerWithWco("120.000,-35.000,0.000"));
      await act(async () => {
        await result.current.setZeroAtHome();
      });
      expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith("G10 L20 P1 X0 Y0");
      expect(result.current.homeCheck).toEqual({ kind: "at-home" });
      expect(result.current.originReady).toBe(true);
    });
  });

  it("stops the machine and ends the wait, leaving the point to be moved to again", async () => {
    const { result } = renderHook(() => useBedMeshCalibration(zController()));
    await act(async () => {
      result.current.setXPoints(2);
      result.current.setYPoints(2);
    });
    await runWithIdleStatus(() => result.current.startProbing());
    const sendCommand = window.terraForge.fluidnc.sendCommand as ReturnType<typeof vi.fn>;
    sendCommand.mockResolvedValue(undefined); // the move never reports

    let recording!: Promise<void>;
    await act(async () => {
      recording = result.current.recordPoint();
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.stop();
      await recording;
    });

    expect(window.terraForge.fluidnc.pauseJob).toHaveBeenCalled();
    expect(window.terraForge.fluidnc.abortJob).toHaveBeenCalled();
    expect(result.current.error).toMatch(/^Stopped/);
    expect(result.current.busy).toBe(false);
    expect(result.current.index).toBe(1);
    expect(result.current.atPoint).toBe(false);

    await runWithIdleStatus(() => result.current.moveToPoint());
    expect(result.current.atPoint).toBe(true);
  });
});
