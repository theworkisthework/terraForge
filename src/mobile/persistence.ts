import type { AppConfig, MachineConfig, PageSize } from "../types";
import {
  BUILT_IN_PAGE_SIZES,
  DEFAULT_APP_CONFIG,
  DEFAULT_MACHINE_CONFIGS,
  cloneMachineConfigs,
  clonePageSizes,
  normalizeConfigs,
} from "../main/config/defaults";

// localStorage-backed equivalent of main/config/persistence.ts.
// (WebView storage is private to the app and survives restarts.)

const KEYS = {
  machines: "terraforge.machine-configs",
  appConfig: "terraforge.app-config",
  pageSizes: "terraforge.page-sizes",
} as const;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export async function loadConfigs(): Promise<MachineConfig[]> {
  const stored = read<MachineConfig[]>(KEYS.machines);
  return stored
    ? normalizeConfigs(stored)
    : cloneMachineConfigs(DEFAULT_MACHINE_CONFIGS);
}

export async function saveConfigs(configs: MachineConfig[]): Promise<void> {
  write(KEYS.machines, configs);
}

export async function loadPageSizes(): Promise<PageSize[]> {
  const stored = read<PageSize[]>(KEYS.pageSizes);
  return Array.isArray(stored) && stored.length > 0
    ? stored
    : clonePageSizes(BUILT_IN_PAGE_SIZES);
}

export async function loadAppConfig(): Promise<AppConfig> {
  const parsed = read<Partial<AppConfig>>(KEYS.appConfig) ?? {};
  return {
    debugLoggingEnabled:
      typeof parsed.debugLoggingEnabled === "boolean"
        ? parsed.debugLoggingEnabled
        : DEFAULT_APP_CONFIG.debugLoggingEnabled,
    showConsoleTimestamps:
      typeof parsed.showConsoleTimestamps === "boolean"
        ? parsed.showConsoleTimestamps
        : DEFAULT_APP_CONFIG.showConsoleTimestamps,
  };
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  write(KEYS.appConfig, config);
}
