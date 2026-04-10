import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  disconnectFluidNCWebSocket,
  killFluidNCWebSocket,
  openFluidNCWebSocket,
  scheduleFluidNCReconnect,
  type FluidNCWebSocketState,
} from "../../src/machine/fluidnc/transport/wsLifecycle";

const wsCapture = vi.hoisted(() => ({
  instances: [] as Array<{
    url: string;
    send: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    emit: (event: string, ...args: unknown[]) => boolean;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
  }>,
}));

vi.mock("ws", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require("events");

  class MockWebSocket extends EventEmitter {
    url: string;
    send = vi.fn();
    terminate = vi.fn();
    close = vi.fn();

    constructor(url: string) {
      super();
      this.url = url;
      wsCapture.instances.push(
        this as unknown as (typeof wsCapture.instances)[0],
      );
    }
  }

  return { WebSocket: MockWebSocket };
});

function createState(): FluidNCWebSocketState {
  return {
    ws: null,
    wsReconnectTimer: null,
    wsHost: "192.168.1.100",
    wsPort: 80,
    wsRetryDelay: 3000,
    wsEnabled: true,
    wsGeneration: 0,
  };
}

function lastWs() {
  return wsCapture.instances[wsCapture.instances.length - 1];
}

beforeEach(() => {
  wsCapture.instances.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FluidNC WebSocket lifecycle", () => {
  it("opens a socket, emits connection output, and requests status updates", () => {
    const state = createState();
    const emitConsole = vi.fn();

    openFluidNCWebSocket(state, {
      parseStatus: vi.fn(),
      emitConsole,
      emitStatus: vi.fn(),
      emitPing: vi.fn(),
      scheduleReconnect: vi.fn(),
      setWsPort: vi.fn(),
    });

    lastWs().emit("open");

    expect(lastWs().url).toBe("ws://192.168.1.100:80/");
    expect(emitConsole).toHaveBeenCalledWith(
      "[terraForge] WebSocket connected",
    );
    expect(lastWs().send).toHaveBeenCalledWith("$RI=500\n");
    expect(state.wsRetryDelay).toBe(3000);
  });

  it("parses status and suppresses ping/session noise", () => {
    const state = createState();
    const parseStatus = vi.fn().mockReturnValue({ state: "Idle" });
    const emitStatus = vi.fn();
    const emitPing = vi.fn();
    const emitConsole = vi.fn();

    openFluidNCWebSocket(state, {
      parseStatus,
      emitConsole,
      emitStatus,
      emitPing,
      scheduleReconnect: vi.fn(),
      setWsPort: vi.fn(),
    });

    lastWs().emit("message", "<Idle|MPos:0.000,0.000,0.000>");
    lastWs().emit("message", "PING");
    lastWs().emit("message", "ACTIVE_ID:session1");

    expect(parseStatus).toHaveBeenCalledWith("<Idle|MPos:0.000,0.000,0.000>");
    expect(emitStatus).toHaveBeenCalledWith({ state: "Idle" });
    expect(emitPing).toHaveBeenCalledTimes(1);
    expect(emitConsole).not.toHaveBeenCalled();
  });

  it("switches to port 81 when the server answers HTTP instead of upgrading", () => {
    const state = createState();
    const setWsPort = vi.fn((port: number) => {
      state.wsPort = port;
    });
    const emitConsole = vi.fn();

    openFluidNCWebSocket(state, {
      parseStatus: vi.fn(),
      emitConsole,
      emitStatus: vi.fn(),
      emitPing: vi.fn(),
      scheduleReconnect: vi.fn(),
      setWsPort,
    });

    lastWs().emit("error", new Error("Unexpected server response: 200"));

    expect(setWsPort).toHaveBeenCalledWith(81);
    expect(state.wsPort).toBe(81);
    expect(emitConsole).toHaveBeenCalledWith(
      "[terraForge] WS got HTTP response instead of 101 Upgrade on port 80 — switching to port 81 (FluidNC 3.x)",
    );
  });

  it("schedules reconnects with exponential backoff", () => {
    vi.useFakeTimers();
    const state = createState();
    const reopen = vi.fn();

    scheduleFluidNCReconnect(state, 0, reopen);
    vi.advanceTimersByTime(3000);

    expect(reopen).toHaveBeenCalledTimes(1);
    expect(state.wsRetryDelay).toBe(6000);
  });

  it("disconnects and kills sockets safely", () => {
    vi.useFakeTimers();
    const state = createState();
    state.wsReconnectTimer = setTimeout(() => {}, 60000);
    state.ws = {
      close: vi.fn(),
      terminate: vi.fn(),
    } as unknown as FluidNCWebSocketState["ws"];

    const onFirmwareReset = vi.fn();
    disconnectFluidNCWebSocket(state, { onFirmwareReset });

    expect(onFirmwareReset).toHaveBeenCalledTimes(1);
    expect(state.wsReconnectTimer).toBeNull();
    expect(state.ws).toBeNull();

    state.wsEnabled = true;
    state.wsReconnectTimer = setTimeout(() => {}, 60000);
    state.ws = {
      terminate: vi.fn(),
    } as unknown as FluidNCWebSocketState["ws"];

    killFluidNCWebSocket(state);

    expect(state.wsReconnectTimer).toBeNull();
    expect(state.ws).toBeNull();
  });
});
