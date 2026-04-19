import { dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { readFile, writeFile } from "fs/promises";
import type { MachineConfig, PageSize, PenType } from "../../types";

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
  // Migrate legacy single-feedrate configs written before the jog/draw split.
  const legacy = (config as unknown as Record<string, unknown>).feedrate as
    | number
    | undefined;
  const legacySpeed = typeof legacy === "number" && legacy >= 1 ? legacy : 3000;
  return {
    ...config,
    penDownDelayMs:
      typeof config.penDownDelayMs === "number" && config.penDownDelayMs >= 0
        ? config.penDownDelayMs
        : defaultPenDownDelayMs(config.penType),
    jogSpeed:
      typeof config.jogSpeed === "number" && config.jogSpeed >= 1
        ? config.jogSpeed
        : legacySpeed,
    drawSpeed:
      typeof config.drawSpeed === "number" && config.drawSpeed >= 1
        ? config.drawSpeed
        : legacySpeed,
  };
}

interface ConfigIpcOptions {
  getMainWindow: () => BrowserWindow | null;
  loadConfigs: () => Promise<MachineConfig[]>;
  saveConfigs: (configs: MachineConfig[]) => Promise<void>;
  loadPageSizes: () => Promise<PageSize[]>;
  pageSizesPath: string;
  builtInPageSizes: PageSize[];
}

export function registerConfigIpcHandlers({
  getMainWindow,
  loadConfigs,
  saveConfigs,
  loadPageSizes,
  pageSizesPath,
  builtInPageSizes,
}: ConfigIpcOptions): void {
  ipcMain.handle("config:getMachineConfigs", () => loadConfigs());

  ipcMain.handle(
    "config:saveMachineConfig",
    async (_e, config: MachineConfig) => {
      const configs = await loadConfigs();
      const normalized = normalizeConfig(config);
      const idx = configs.findIndex((item) => item.id === normalized.id);
      if (idx >= 0) configs[idx] = normalized;
      else configs.push(normalized);
      await saveConfigs(configs);
    },
  );

  ipcMain.handle("config:deleteMachineConfig", async (_e, id: string) => {
    const configs = await loadConfigs();
    await saveConfigs(configs.filter((config) => config.id !== id));
  });

  ipcMain.handle("config:exportConfigs", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;

    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export Machine Configs",
      defaultPath: "terraforge-machine-configs.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return null;

    const configs = await loadConfigs();
    const payload = JSON.stringify(
      { terraForge: "machine-configs", version: 1, configs },
      null,
      2,
    );
    await writeFile(result.filePath, payload, "utf-8");
    return result.filePath;
  });

  ipcMain.handle("config:importConfigs", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return { added: 0, skipped: 0 };

    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import Machine Configs",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { added: 0, skipped: 0 };
    }

    const raw = await readFile(result.filePaths[0], "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Not a valid JSON file.");
    }

    let incoming: MachineConfig[];
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "configs" in (parsed as object)
    ) {
      incoming = (parsed as { configs: MachineConfig[] }).configs;
    } else if (Array.isArray(parsed)) {
      incoming = parsed as MachineConfig[];
    } else {
      throw new Error(
        "File does not contain a valid terraForge machine config export.",
      );
    }

    if (!incoming.length) return { added: 0, skipped: 0 };

    const required: (keyof MachineConfig)[] = [
      "name",
      "bedWidth",
      "bedHeight",
      "connection",
    ];
    for (const config of incoming) {
      if (!config || typeof config !== "object") {
        throw new Error("Invalid config entry in import file.");
      }
      for (const key of required) {
        if (!(key in config)) {
          throw new Error(`Config entry missing required field: \"${key}\".`);
        }
      }
    }

    const existing = await loadConfigs();
    const existingIds = new Set(existing.map((config) => config.id));
    const existingNames = new Set(
      existing.map((config) => config.name.toLowerCase().trim()),
    );
    const toAdd: MachineConfig[] = [];
    let skipped = 0;

    for (const config of incoming) {
      const nameKey = (config.name ?? "").toLowerCase().trim();
      if (existingIds.has(config.id) || existingNames.has(nameKey)) {
        skipped++;
      } else {
        toAdd.push(normalizeConfig(config));
        existingIds.add(config.id);
        existingNames.add(nameKey);
      }
    }

    if (toAdd.length > 0) {
      await saveConfigs([...existing, ...toAdd]);
    }

    return { added: toAdd.length, skipped };
  });

  ipcMain.handle("config:loadPageSizes", () => loadPageSizes());

  ipcMain.handle("config:openPageSizesFile", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    try {
      await readFile(pageSizesPath, "utf-8");
    } catch {
      await writeFile(
        pageSizesPath,
        JSON.stringify(builtInPageSizes, null, 2),
        "utf-8",
      );
    }

    shell.openPath(pageSizesPath);
  });
}
