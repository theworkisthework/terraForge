/**
 * The connection task: what it says, and when. A Wi-Fi machine is only
 * "Connected" once it has sent a frame — `wsLive` in the machine store —
 * not when the call that starts the connection returns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectMachine,
  FIRST_RESPONSE_TIMEOUT_MS,
} from "@renderer/features/machine/utils/machineConnection";
import { useMachineStore } from "@renderer/store/machineStore";
import { useTaskStore } from "@renderer/store/taskStore";
import { createMachineConfig } from "../helpers/factories";

const wifi = createMachineConfig({ id: "w", connection: { type: "wifi", host: "plotter.local", port: 80 } });
const usb = createMachineConfig({ id: "u", connection: { type: "usb", serialPath: "COM3" } });

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/** The one connection task, as "status: label". */
function connectionTask() {
  const all = Object.values(useTaskStore.getState().tasks).filter((t) => t.type === "ws-connect");
  expect(all.length).toBeLessThanOrEqual(1);
  return all[0];
}
const shown = () => {
  const task = connectionTask();
  return task ? `${task.status}: ${task.label}` : null;
};

/** The first frame arrives. */
const goLive = () => useMachineStore.getState().setWsLive(true);

beforeEach(() => {
  vi.useFakeTimers();
  useTaskStore.setState({ tasks: {} });
  useMachineStore.setState({ configs: [wifi, usb], activeConfigId: "w", connected: false, wsLive: false });
  mock(window.terraForge.fluidnc.connectWebSocket).mockReset().mockResolvedValue(undefined);
  mock(window.terraForge.fluidnc.disconnectWebSocket).mockReset().mockResolvedValue(undefined);
  mock(window.terraForge.serial.connect).mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // Ends any watch for a first frame left running.
  useMachineStore.getState().setConnected(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("connectMachine over Wi-Fi", () => {
  it("keeps the task running after the machine is found, until its first frame arrives", async () => {
    await connectMachine(wifi);

    expect(window.terraForge.fluidnc.connectWebSocket).toHaveBeenCalledWith("plotter.local", 80, undefined);
    // Marked connected, so that the toolbar offers Disconnect...
    expect(useMachineStore.getState().connected).toBe(true);
    // ...but not reported as connected.
    expect(shown()).toBe("running: Waiting for plotter.local to respond…");

    goLive();
    expect(shown()).toBe("completed: Connected");
  });

  it("says Connected at once when a frame arrived while the machine was being found", async () => {
    mock(window.terraForge.fluidnc.connectWebSocket).mockImplementation(async () => void goLive());
    await connectMachine(wifi);
    expect(shown()).toBe("completed: Connected");
  });

  it("does not take a frame from an earlier connection as this one's", async () => {
    useMachineStore.setState({ wsLive: true });
    await connectMachine(wifi);
    expect(shown()).toBe("running: Waiting for plotter.local to respond…");
  });

  it("reports a machine that cannot be found", async () => {
    mock(window.terraForge.fluidnc.connectWebSocket).mockRejectedValue(new Error("Connection refused"));
    await connectMachine(wifi);

    expect(shown()).toBe("error: Connection failed");
    expect(connectionTask().error).toBe("Connection refused");
    expect(useMachineStore.getState().connected).toBe(false);
  });

  it("reports a machine that never answers, then says Connected if it does", async () => {
    await connectMachine(wifi);
    vi.advanceTimersByTime(FIRST_RESPONSE_TIMEOUT_MS - 1);
    expect(connectionTask().status).toBe("running");

    vi.advanceTimersByTime(1);
    expect(shown()).toBe("error: No response from plotter.local");
    expect(connectionTask().error).toMatch(/keep trying/);
    // Main is still retrying the socket, so it stays connected for Disconnect.
    expect(useMachineStore.getState().connected).toBe(true);

    goLive();
    expect(shown()).toBe("completed: Connected");
  });

  it("does not report a timeout once it is connected", async () => {
    await connectMachine(wifi);
    goLive();
    vi.advanceTimersByTime(FIRST_RESPONSE_TIMEOUT_MS * 2);
    expect(shown()).toBe("completed: Connected");
  });

  it("reads cancelled when disconnected before the machine answers", async () => {
    await connectMachine(wifi);
    useMachineStore.getState().setConnected(false);
    expect(shown()).toBe("cancelled: Connection cancelled");

    // And nothing more comes of it.
    vi.advanceTimersByTime(FIRST_RESPONSE_TIMEOUT_MS * 2);
    goLive();
    expect(shown()).toBe("cancelled: Connection cancelled");
  });

  it("takes down its 'no response' error when disconnected after the timeout", async () => {
    await connectMachine(wifi);
    vi.advanceTimersByTime(FIRST_RESPONSE_TIMEOUT_MS);
    useMachineStore.getState().setConnected(false);
    expect(shown()).toBeNull();
  });

  it("can be cancelled while waiting for the first frame", async () => {
    await connectMachine(wifi);
    useTaskStore.getState().cancelTask(connectionTask().id);

    expect(shown()).toBe("cancelled: Connection cancelled");
    expect(window.terraForge.fluidnc.disconnectWebSocket).toHaveBeenCalledTimes(1);
    expect(useMachineStore.getState().connected).toBe(false);
    // Cancelling is not also sent to main, which does not know this task.
    expect(window.terraForge.tasks.cancel).not.toHaveBeenCalled();
  });

  it("can be cancelled while the machine is still being found", async () => {
    let rejectConnect!: (err: Error) => void;
    mock(window.terraForge.fluidnc.connectWebSocket).mockReturnValue(
      new Promise((_resolve, reject) => (rejectConnect = reject)),
    );
    const connecting = connectMachine(wifi);
    expect(shown()).toBe("running: Connecting to plotter.local…");

    useTaskStore.getState().cancelTask(connectionTask().id);
    expect(window.terraForge.fluidnc.disconnectWebSocket).toHaveBeenCalledTimes(1);
    // Disconnecting is what makes main give up the attempt.
    rejectConnect(new Error("Connection attempt cancelled"));
    await connecting;

    expect(shown()).toBe("cancelled: Connection cancelled");
    expect(useMachineStore.getState().connected).toBe(false);
  });

  it("stops offering Cancel once the task has ended", async () => {
    await connectMachine(wifi);
    goLive();
    useTaskStore.getState().cancelTask(connectionTask().id);
    // With no callback of its own left, a cancel falls through to main.
    expect(window.terraForge.fluidnc.disconnectWebSocket).not.toHaveBeenCalled();
    expect(window.terraForge.tasks.cancel).toHaveBeenCalled();
  });
});

describe("connectMachine over serial", () => {
  it("says Connected once the port is open", async () => {
    await connectMachine(usb);

    expect(window.terraForge.serial.connect).toHaveBeenCalledWith("COM3", 115200);
    expect(shown()).toBe("completed: Connected");
    expect(useMachineStore.getState().connected).toBe(true);
  });

  it("reports a port that will not open", async () => {
    mock(window.terraForge.serial.connect).mockRejectedValue(new Error("Access denied"));
    await connectMachine(usb);

    expect(shown()).toBe("error: Connection failed");
    expect(connectionTask().error).toBe("Access denied");
    expect(useMachineStore.getState().connected).toBe(false);
  });
});
