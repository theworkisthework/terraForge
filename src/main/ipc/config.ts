import { dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { readFile, writeFile } from "fs/promises";
import type { AppConfig, MachineConfig, PageSize } from "../../types";
import type { MainPersistence } from "../config/persistence";
import { normalizeMachineConfig } from "../config/persistence";

interface ConfigIpcOptions {
  getMainWindow: () => BrowserWindow | null;
  loadConfigs: () => Promise<MachineConfig[]>;
  updateConfigs: MainPersistence["updateConfigs"];
  loadPageSizes: () => Promise<PageSize[]>;
  loadAppConfig: () => Promise<AppConfig>;
  saveAppConfig: (config: AppConfig) => Promise<void>;
  onAppConfigSaved?: (config: AppConfig) => void;
  pageSizesPath: string;
  builtInPageSizes: PageSize[];
}

export function registerConfigIpcHandlers({
  getMainWindow,
  loadConfigs,
  updateConfigs,
  loadPageSizes,
  loadAppConfig,
  saveAppConfig,
  onAppConfigSaved,
  pageSizesPath,
  builtInPageSizes,
}: ConfigIpcOptions): void {
  ipcMain.handle("config:getMachineConfigs", () => loadConfigs());

  ipcMain.handle(
    "config:saveMachineConfig",
    (_e, config: MachineConfig) =>
      updateConfigs((configs) => {
        const normalized = normalizeMachineConfig(config);
        const idx = configs.findIndex((item) => item.id === normalized.id);
        if (idx >= 0) configs[idx] = normalized;
        else configs.push(normalized);
        return configs;
      }),
  );

  ipcMain.handle("config:deleteMachineConfig", (_e, id: string) =>
    updateConfigs((configs) => configs.filter((config) => config.id !== id)),
  );

  ipcMain.handle("config:getAppConfig", () => loadAppConfig());

  ipcMain.handle("config:saveAppConfig", async (_e, config: AppConfig) => {
    await saveAppConfig(config);
    onAppConfigSaved?.(config);
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

    let added = 0;
    let skipped = 0;

    await updateConfigs((existing) => {
      const existingIds = new Set(existing.map((config) => config.id));
      const existingNames = new Set(
        existing.map((config) => config.name.toLowerCase().trim()),
      );
      const toAdd: MachineConfig[] = [];

      for (const config of incoming) {
        const nameKey = (config.name ?? "").toLowerCase().trim();
        if (existingIds.has(config.id) || existingNames.has(nameKey)) {
          skipped++;
        } else {
          toAdd.push(normalizeMachineConfig(config));
          existingIds.add(config.id);
          existingNames.add(nameKey);
        }
      }

      added = toAdd.length;
      return toAdd.length > 0 ? [...existing, ...toAdd] : null;
    });

    return { added, skipped };
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
