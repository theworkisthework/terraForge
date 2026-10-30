import { useEffect } from "react";
import { useMachineStore } from "../store/machineStore";
import { useRendererPluginStore } from "../store/rendererPluginStore";
import { startBitmapRenderService } from "../features/bitmap-renderers/bitmapRenderService";
import { useTaskStore } from "../store/taskStore";
import { useConsoleStore } from "../store/consoleStore";
import { useAppConfigStore } from "../store/appConfigStore";
import { useThemeStore, applyTheme } from "../store/themeStore";

/**
 * App start-up: loads machine configs, renderer plugins and app settings,
 * starts the bitmap render service, and subscribes to the main process's
 * status, console, task, ping and firmware updates. Also keeps the <html>
 * theme class in step with the theme store.
 */
export function useAppBootstrap() {
  const loadRendererPlugins = useRendererPluginStore((s) => s.loadRendererPlugins);
  const setConfigs = useMachineStore((s) => s.setConfigs);
  const setStatus = useMachineStore((s) => s.setStatus);
  const setWsLive = useMachineStore((s) => s.setWsLive);
  const setFwInfo = useMachineStore((s) => s.setFwInfo);
  const upsertTask = useTaskStore((s) => s.upsertTask);
  const appendLine = useConsoleStore((s) => s.appendLine);
  const setDebugLoggingEnabled = useAppConfigStore((s) => s.setDebugLoggingEnabled);
  const setShowConsoleTimestamps = useAppConfigStore((s) => s.setShowConsoleTimestamps);
  const theme = useThemeStore((s) => s.theme);

  // Keep <html> class in sync with theme store
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    // Load machine configs
    window.terraForge.config.getMachineConfigs().then(setConfigs);
    void loadRendererPlugins();
    const stopBitmapRenderService = startBitmapRenderService();
    window.terraForge.config
      .getAppConfig()
      .then((cfg) => {
        setDebugLoggingEnabled(cfg.debugLoggingEnabled);
        setShowConsoleTimestamps(cfg.showConsoleTimestamps);
      })
      .catch(() => {});

    // Subscribe to status updates pushed from main process
    const offStatus = window.terraForge.fluidnc.onStatusUpdate(setStatus);
    const offConsole = window.terraForge.fluidnc.onConsoleMessage(appendLine);

    // Serial data — route to console the same way WebSocket messages are
    const offSerialData = window.terraForge.serial.onData(appendLine);

    // Subscribe to background task updates
    const offTask = window.terraForge.tasks.onTaskUpdate(upsertTask);

    // Ping watchdog — if no ping within 15s, mark WS as dead
    let pingTimer: ReturnType<typeof setTimeout> | null = null;
    const resetPingTimer = () => {
      setWsLive(true);
      if (pingTimer) clearTimeout(pingTimer);
      pingTimer = setTimeout(() => setWsLive(false), 15_000);
    };
    const offPing = window.terraForge.fluidnc.onPing(resetPingTimer);
    const offFirmware = window.terraForge.fluidnc.onFirmwareInfo(setFwInfo);

    return () => {
      offStatus();
      offConsole();
      offSerialData();
      offTask();
      offPing();
      offFirmware();
      stopBitmapRenderService();
      if (pingTimer) clearTimeout(pingTimer);
    };
  }, [
    setConfigs,
    loadRendererPlugins,
    setStatus,
    setWsLive,
    setFwInfo,
    upsertTask,
    appendLine,
    setDebugLoggingEnabled,
    setShowConsoleTimestamps,
  ]);
}
