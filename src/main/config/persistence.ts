import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { AppConfig, MachineConfig, PageSize } from "../../types";

import {
  BUILT_IN_PAGE_SIZES,
  DEFAULT_APP_CONFIG,
  DEFAULT_MACHINE_CONFIGS,
  cloneMachineConfigs,
  clonePageSizes,
  normalizeConfigs,
} from "./defaults";

export { DEFAULT_MACHINE_CONFIGS, BUILT_IN_PAGE_SIZES };

export interface MainPersistence {
  configPath: string;
  pageSizesPath: string;
  appConfigPath: string;
  loadConfigs: () => Promise<MachineConfig[]>;
  saveConfigs: (configs: MachineConfig[]) => Promise<void>;
  loadPageSizes: () => Promise<PageSize[]>;
  loadAppConfig: () => Promise<AppConfig>;
  saveAppConfig: (config: AppConfig) => Promise<void>;
}

export function createPersistence(userDataPath: string): MainPersistence {
  const configPath = join(userDataPath, "machine-configs.json");
  const pageSizesPath = join(userDataPath, "page-sizes.json");
  const appConfigPath = join(userDataPath, "app-config.json");

  async function loadConfigs(): Promise<MachineConfig[]> {
    if (!existsSync(configPath))
      return cloneMachineConfigs(DEFAULT_MACHINE_CONFIGS);
    try {
      const raw = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw) as MachineConfig[];
      return normalizeConfigs(parsed);
    } catch {
      return cloneMachineConfigs(DEFAULT_MACHINE_CONFIGS);
    }
  }

  async function saveConfigs(configs: MachineConfig[]): Promise<void> {
    await writeFile(configPath, JSON.stringify(configs, null, 2), "utf-8");
  }

  async function loadPageSizes(): Promise<PageSize[]> {
    // Users can customise page sizes by editing page-sizes.json in userData.
    if (!existsSync(pageSizesPath)) {
      await writeFile(
        pageSizesPath,
        JSON.stringify(BUILT_IN_PAGE_SIZES, null, 2),
        "utf-8",
      );
      return clonePageSizes(BUILT_IN_PAGE_SIZES);
    }

    try {
      const raw = await readFile(pageSizesPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0)
        return parsed as PageSize[];
      return clonePageSizes(BUILT_IN_PAGE_SIZES);
    } catch {
      return clonePageSizes(BUILT_IN_PAGE_SIZES);
    }
  }

  async function loadAppConfig(): Promise<AppConfig> {
    if (!existsSync(appConfigPath)) return { ...DEFAULT_APP_CONFIG };
    try {
      const raw = await readFile(appConfigPath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
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
    } catch {
      return { ...DEFAULT_APP_CONFIG };
    }
  }

  async function saveAppConfig(config: AppConfig): Promise<void> {
    await writeFile(appConfigPath, JSON.stringify(config, null, 2), "utf-8");
  }

  return {
    configPath,
    pageSizesPath,
    appConfigPath,
    loadConfigs,
    saveConfigs,
    loadPageSizes,
    loadAppConfig,
    saveAppConfig,
  };
}
