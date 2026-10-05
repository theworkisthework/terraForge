import { useEffect } from "react";
import { create } from "zustand";
import type { BackgroundTask } from "../../types";
import { useMachineStore } from "../../renderer/src/store/machineStore";
import { applyTheme, useThemeStore } from "../../renderer/src/store/themeStore";

// Small session-only store for the mobile UI: console tail and file-transfer
// tasks. Machine/config state lives in the shared machineStore.

interface SessionState {
  log: string[];
  tasks: Record<string, BackgroundTask>;
  connectError: string | null;
  appendLog: (line: string) => void;
  upsertTask: (task: BackgroundTask) => void;
  clearTask: (id: string) => void;
  setConnectError: (e: string | null) => void;
}

const MAX_LOG = 200;

export const useSession = create<SessionState>((set) => ({
  log: [],
  tasks: {},
  connectError: null,
  appendLog: (line) =>
    set((s) => ({ log: [...s.log.slice(-(MAX_LOG - 1)), line] })),
  upsertTask: (task) =>
    set((s) => ({ tasks: { ...s.tasks, [task.id]: task } })),
  clearTask: (id) =>
    set((s) => {
      const { [id]: _removed, ...rest } = s.tasks;
      return { tasks: rest };
    }),
  setConnectError: (connectError) => set({ connectError }),
}));

/** Loads configs and wires the machine event streams. Mount once at the root. */
export function useSessionBootstrap(): void {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    const api = window.terraForge;
    const m = useMachineStore.getState();
    api.config.getMachineConfigs().then(m.setConfigs);
    api.config
      .getAppConfig()
      .catch(() => null)
      .then(() => undefined);

    let pingTimer: ReturnType<typeof setTimeout> | null = null;
    const offs = [
      api.fluidnc.onStatusUpdate((s) =>
        useMachineStore.getState().setStatus(s),
      ),
      api.fluidnc.onConsoleMessage((l) => useSession.getState().appendLog(l)),
      api.fluidnc.onFirmwareInfo((i) =>
        useMachineStore.getState().setFwInfo(i),
      ),
      api.fluidnc.onPing(() => {
        useMachineStore.getState().setWsLive(true);
        if (pingTimer) clearTimeout(pingTimer);
        // No ping for 15 s → treat the socket as dead.
        pingTimer = setTimeout(
          () => useMachineStore.getState().setWsLive(false),
          15_000,
        );
      }),
      api.tasks.onTaskUpdate((t) => useSession.getState().upsertTask(t)),
    ];
    return () => {
      offs.forEach((off) => off());
      if (pingTimer) clearTimeout(pingTimer);
    };
  }, []);
}

export async function connectActive(): Promise<void> {
  const { activeConfig, setConnected } = useMachineStore.getState();
  const cfg = activeConfig();
  const { setConnectError } = useSession.getState();
  if (!cfg) return;
  setConnectError(null);
  try {
    if (cfg.connection.type !== "wifi") {
      throw new Error("Only Wi-Fi machines are supported on mobile.");
    }
    await window.terraForge.fluidnc.connectWebSocket(
      cfg.connection.host!,
      cfg.connection.port ?? 80,
      cfg.connection.wsPort,
    );
    setConnected(true);
  } catch (err) {
    setConnectError(err instanceof Error ? err.message : String(err));
  }
}

export async function disconnectActive(): Promise<void> {
  await window.terraForge.fluidnc.disconnectWebSocket();
  useMachineStore.getState().setConnected(false);
}
