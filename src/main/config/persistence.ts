import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { MachineConfig, PageSize, PenType } from "../../types";

export interface MainPersistence {
  configPath: string;
  pageSizesPath: string;
  loadConfigs: () => Promise<MachineConfig[]>;
  saveConfigs: (configs: MachineConfig[]) => Promise<void>;
  loadPageSizes: () => Promise<PageSize[]>;
}

export const DEFAULT_MACHINE_CONFIGS: MachineConfig[] = [
  {
    id: "terrapen-default",
    name: "TerraPen (Default)",
    bedWidth: 220,
    bedHeight: 200,
    origin: "bottom-left",
    penType: "solenoid",
    penUpCommand: "M5",
    penDownCommand: "M3 S1000",
    penDownDelayMs: 50,
    feedrate: 3000,
    connection: {
      type: "wifi",
      host: "fluidnc.local",
      port: 80,
    },
  },
];

export const BUILT_IN_PAGE_SIZES: PageSize[] = [
  { id: "a2", name: "A2", widthMM: 420, heightMM: 594 },
  { id: "a3", name: "A3", widthMM: 297, heightMM: 420 },
  { id: "a4", name: "A4", widthMM: 210, heightMM: 297 },
  { id: "a5", name: "A5", widthMM: 148, heightMM: 210 },
  { id: "a6", name: "A6", widthMM: 105, heightMM: 148 },
  { id: "letter", name: "Letter", widthMM: 215.9, heightMM: 279.4 },
  { id: "legal", name: "Legal", widthMM: 215.9, heightMM: 355.6 },
  { id: "tabloid", name: "Tabloid", widthMM: 279.4, heightMM: 431.8 },
];

function cloneMachineConfigs(configs: MachineConfig[]): MachineConfig[] {
  return configs.map((config) => ({
    ...config,
    connection: { ...config.connection },
  }));
}

function defaultPenDownDelayMs(penType: PenType): number {
  switch (penType) {
    case "solenoid":
      return 50;
    case "servo":
    case "stepper":
      return 0;
    default:
      return 0;
  }
}

function normalizeConfig(config: MachineConfig): MachineConfig {
  return {
    ...config,
    penDownDelayMs:
      typeof config.penDownDelayMs === "number" && config.penDownDelayMs >= 0
        ? config.penDownDelayMs
        : defaultPenDownDelayMs(config.penType),
  };
}

function normalizeConfigs(configs: MachineConfig[]): MachineConfig[] {
  return configs.map(normalizeConfig);
}

function clonePageSizes(pageSizes: PageSize[]): PageSize[] {
  return pageSizes.map((pageSize) => ({ ...pageSize }));
}

export function createPersistence(userDataPath: string): MainPersistence {
  const configPath = join(userDataPath, "machine-configs.json");
  const pageSizesPath = join(userDataPath, "page-sizes.json");

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

  return {
    configPath,
    pageSizesPath,
    loadConfigs,
    saveConfigs,
    loadPageSizes,
  };
}
