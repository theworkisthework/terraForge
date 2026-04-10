import { WebSocket } from "ws";
import type { MachineStatus } from "../../../types";

export interface FluidNCWebSocketState {
  ws: WebSocket | null;
  wsReconnectTimer: NodeJS.Timeout | null;
  wsHost: string;
  wsPort: number;
  wsRetryDelay: number;
  wsEnabled: boolean;
  wsGeneration: number;
}

interface DisconnectHandlers {
  onFirmwareReset: () => void;
}

interface OpenHandlers {
  parseStatus: (raw: string) => MachineStatus;
  emitConsole: (message: string) => void;
  emitStatus: (status: MachineStatus) => void;
  emitPing: () => void;
  scheduleReconnect: (generation: number) => void;
  setWsPort: (port: number) => void;
}

export function disconnectFluidNCWebSocket(
  state: FluidNCWebSocketState,
  handlers: DisconnectHandlers,
): void {
  state.wsEnabled = false;
  state.wsGeneration++;
  if (state.wsReconnectTimer) {
    clearTimeout(state.wsReconnectTimer);
    state.wsReconnectTimer = null;
  }
  if (state.ws) {
    try {
      state.ws.close(1000);
    } catch {
      // already closed
    }
    state.ws = null;
  }
  handlers.onFirmwareReset();
}

export function killFluidNCWebSocket(state: FluidNCWebSocketState): void {
  state.wsEnabled = false;
  state.wsGeneration++;
  if (state.wsReconnectTimer) {
    clearTimeout(state.wsReconnectTimer);
    state.wsReconnectTimer = null;
  }
  if (state.ws) {
    try {
      state.ws.terminate();
    } catch {
      // already dead
    }
    state.ws = null;
  }
}

export function scheduleFluidNCReconnect(
  state: FluidNCWebSocketState,
  generation: number,
  reopen: () => void,
): void {
  if (!state.wsEnabled || generation !== state.wsGeneration) return;
  state.wsReconnectTimer = setTimeout(() => reopen(), state.wsRetryDelay);
  state.wsRetryDelay = Math.min(state.wsRetryDelay * 2, 60_000);
}

export function openFluidNCWebSocket(
  state: FluidNCWebSocketState,
  handlers: OpenHandlers,
): void {
  if (!state.wsEnabled) return;

  if (state.ws) {
    try {
      state.ws.terminate();
    } catch {
      // ignore stale socket failures
    }
    state.ws = null;
  }

  const generation = ++state.wsGeneration;
  const ws = new WebSocket(`ws://${state.wsHost}:${state.wsPort}/`);
  state.ws = ws;

  ws.on("open", () => {
    if (generation !== state.wsGeneration) {
      ws.terminate();
      return;
    }
    state.wsRetryDelay = 3000;
    handlers.emitConsole("[terraForge] WebSocket connected");
    try {
      ws.send("$RI=500\n");
    } catch {
      // ignore send errors during startup
    }
  });

  ws.on("message", (raw) => {
    if (generation !== state.wsGeneration) return;
    const text = raw.toString().trim();
    if (text.startsWith("<")) {
      handlers.emitStatus(handlers.parseStatus(text));
      return;
    }
    if (text === "PING" || text.startsWith("PING:")) {
      handlers.emitPing();
      return;
    }
    if (
      text.startsWith("currentID:") ||
      text.startsWith("CURRENT_ID:") ||
      text.startsWith("activeID:") ||
      text.startsWith("ACTIVE_ID:")
    ) {
      return;
    }
    if (text.length > 0) {
      handlers.emitConsole(text);
    }
  });

  ws.on("close", (_code, reason) => {
    if (generation !== state.wsGeneration) return;
    const message = reason?.toString() ?? "";
    const is503 = message.includes("503");
    if (!is503 && state.wsRetryDelay <= 3000) {
      handlers.emitConsole("[terraForge] WebSocket disconnected — retrying…");
    }
    handlers.scheduleReconnect(generation);
  });

  ws.on("error", (err) => {
    if (generation !== state.wsGeneration) return;
    const is503 = err.message.includes("503");
    const isHttp200 =
      err.message.includes("200") ||
      /unexpected server response/i.test(err.message);

    if (isHttp200 && state.wsPort !== 81) {
      handlers.emitConsole(
        `[terraForge] WS got HTTP response instead of 101 Upgrade on port ${state.wsPort} — switching to port 81 (FluidNC 3.x)`,
      );
      handlers.setWsPort(81);
      state.wsRetryDelay = 3000;
      return;
    }

    if (!is503) {
      handlers.emitConsole(`[terraForge] WebSocket error: ${err.message}`);
    }
  });
}
