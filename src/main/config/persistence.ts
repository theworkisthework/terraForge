import { randomUUID } from "crypto";
import { existsSync } from "fs";
import {
  copyFile,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "fs/promises";
import { join } from "path";
import type { AppConfig, InkServiceStation, MachineConfig, PageSize, PenType } from "../../types";

function normalizePenType(penType: unknown): PenType {
  switch (penType) {
    case "solenoid":
    case "solenoid-hardware":
      return "solenoid-hardware";
    case "solenoid-software":
    case "servo":
    case "stepper":
      return penType;
    default:
      return "solenoid-hardware";
  }
}

/** A settings file that could not be parsed and was set aside. */
export interface CorruptFileReport {
  /** The file that could not be read; defaults are in use in its place. */
  path: string;
  /** Where the unreadable file was moved, or null if it could not be kept. */
  backupPath: string | null;
}

export interface PersistenceOptions {
  /** Called once for each settings file found corrupt. */
  onCorruptFile?: (report: CorruptFileReport) => void;
}

export interface MainPersistence {
  configPath: string;
  pageSizesPath: string;
  appConfigPath: string;
  loadConfigs: () => Promise<MachineConfig[]>;
  saveConfigs: (configs: MachineConfig[]) => Promise<void>;
  /**
   * Reads the machine configs, applies `change` and saves the result as one
   * step, so two updates arriving together cannot overwrite each other.
   * Returning null leaves the file untouched.
   */
  updateConfigs: (
    change: (configs: MachineConfig[]) => MachineConfig[] | null,
  ) => Promise<void>;
  loadPageSizes: () => Promise<PageSize[]>;
  loadAppConfig: () => Promise<AppConfig>;
  saveAppConfig: (config: AppConfig) => Promise<void>;
}

export const DEFAULT_MACHINE_CONFIGS: MachineConfig[] = [
  {
    id: "terrapen-default",
    name: "TerraPen (Default)",
    bedWidth: 594,
    bedHeight: 420,
    origin: "bottom-left",
    penType: "stepper",
    penUpCommand: "G0Z5",
    penDownCommand: "G0Z0",
    invertZJogControls: false,
    penDownDelayMs: 0,
    penUpDelayMs: 0,
    jogSpeed: 6000,
    drawSpeed: 6000,
    connection: {
      type: "wifi",
      host: "terrapen.local",
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

export const DEFAULT_APP_CONFIG: AppConfig = {
  debugLoggingEnabled: false,
  showConsoleTimestamps: true,
};

function cloneMachineConfigs(configs: MachineConfig[]): MachineConfig[] {
  return configs.map((config) => ({
    ...config,
    connection: { ...config.connection },
  }));
}

function defaultPenDownDelayMs(penType: PenType): number {
  switch (penType) {
    case "solenoid-hardware":
    case "solenoid-software":
      return 50;
    case "servo":
    case "stepper":
      return 0;
    default:
      return 0;
  }
}

function defaultPenUpDelayMs(_penType: PenType): number {
  return 0;
}

/**
 * A config's ink service stations as read from disk or an imported file:
 * the entries that are usable, or undefined (the defaults then apply) if
 * the field is missing or is not a list.
 */
function normalizeInkServiceStations(value: unknown): InkServiceStation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (station): station is InkServiceStation =>
      typeof station === "object" &&
      station !== null &&
      typeof station.id === "string" &&
      typeof station.name === "string" &&
      typeof station.type === "string" &&
      Number.isFinite(station.x) &&
      Number.isFinite(station.y),
  );
}

export function normalizeMachineConfig(config: MachineConfig): MachineConfig {
  // Migrate legacy single-feedrate configs written before the jog/draw split.
  const legacy = (config as unknown as Record<string, unknown>).feedrate as
    | number
    | undefined;
  const legacySpeed = typeof legacy === "number" && legacy >= 1 ? legacy : 3000;
  const penType = normalizePenType(config.penType);
  const { inkServiceStations: _stations, ...rest } = config;
  const inkServiceStations = normalizeInkServiceStations(config.inkServiceStations);
  return {
    ...rest,
    // Left out, not written as undefined or empty, when there are none to keep.
    ...(inkServiceStations && inkServiceStations.length > 0 ? { inkServiceStations } : {}),
    penType,
    penDownDelayMs:
      typeof config.penDownDelayMs === "number" && config.penDownDelayMs >= 0
        ? config.penDownDelayMs
        : defaultPenDownDelayMs(penType),
    penUpDelayMs:
      typeof config.penUpDelayMs === "number" && config.penUpDelayMs >= 0
        ? config.penUpDelayMs
        : defaultPenUpDelayMs(penType),
    jogSpeed:
      typeof config.jogSpeed === "number" && config.jogSpeed >= 1
        ? config.jogSpeed
        : legacySpeed,
    drawSpeed:
      typeof config.drawSpeed === "number" && config.drawSpeed >= 1
        ? config.drawSpeed
        : legacySpeed,
    invertZJogControls:
      typeof config.invertZJogControls === "boolean"
        ? config.invertZJogControls
        : false,
  };
}

function normalizeConfigs(configs: MachineConfig[]): MachineConfig[] {
  return configs.map(normalizeMachineConfig);
}

/**
 * Writes through a temporary file in the same folder, then renames it over
 * the target. A crash or power cut mid-write leaves the previous file whole
 * instead of a truncated one.
 */
export async function writeFileAtomic(
  path: string,
  content: string,
): Promise<void> {
  const tempPath = `${path}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    const handle = await open(tempPath, "w");
    try {
      await handle.writeFile(content, "utf-8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tempPath, path);
  } catch (err) {
    await unlink(tempPath).catch(() => {});
    throw err;
  }
}

/** `machine-configs.json.20260131T093000.bak`, beside the original. */
function backupPathFor(path: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..*$/, "");
  return `${path}.${stamp}.bak`;
}

/**
 * Moves an unreadable settings file aside so that the next save cannot
 * overwrite it, and whoever needs to can still recover values from it by
 * hand. Resolves to where it went, or null if it could not be kept.
 */
async function setAsideCorruptFile(path: string): Promise<string | null> {
  const backupPath = backupPathFor(path);
  try {
    await rename(path, backupPath);
    return backupPath;
  } catch {
    // Could not move it (locked, say): a copy still preserves the contents.
    try {
      await copyFile(path, backupPath);
      return backupPath;
    } catch {
      return null;
    }
  }
}

/** Thrown by a parser to mark a file's contents as unusable. */
class CorruptFileError extends Error {}

function clonePageSizes(pageSizes: PageSize[]): PageSize[] {
  return pageSizes.map((pageSize) => ({ ...pageSize }));
}

export function createPersistence(
  userDataPath: string,
  { onCorruptFile }: PersistenceOptions = {},
): MainPersistence {
  const configPath = join(userDataPath, "machine-configs.json");
  const pageSizesPath = join(userDataPath, "page-sizes.json");
  const appConfigPath = join(userDataPath, "app-config.json");

  // Every read and write of the settings files runs through this queue, one
  // at a time, so a save can never interleave with another save or with the
  // read half of an update.
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  }

  /**
   * Reads and parses a settings file. A missing file gives `fallback()`. So
   * does a file that cannot be parsed — but that one is first moved aside
   * and reported, rather than left for the next save to overwrite.
   */
  async function readSettings<T>(
    path: string,
    parse: (json: unknown) => T,
    fallback: () => T,
  ): Promise<T> {
    let raw: string;
    try {
      raw = await readFile(path, "utf-8");
    } catch {
      // Missing, or unreadable for now (permissions, a locked file). Nothing
      // is known to be wrong with its contents, so it is left where it is.
      return fallback();
    }
    try {
      return parse(JSON.parse(raw));
    } catch {
      const backupPath = await setAsideCorruptFile(path);
      onCorruptFile?.({ path, backupPath });
      return fallback();
    }
  }

  const readConfigs = () =>
    readSettings(
      configPath,
      (json) => {
        if (!Array.isArray(json)) throw new CorruptFileError();
        return normalizeConfigs(json as MachineConfig[]);
      },
      () => cloneMachineConfigs(DEFAULT_MACHINE_CONFIGS),
    );

  const writeConfigs = (configs: MachineConfig[]) =>
    writeFileAtomic(configPath, JSON.stringify(configs, null, 2));

  const loadConfigs = () => enqueue(readConfigs);

  const saveConfigs = (configs: MachineConfig[]) =>
    enqueue(() => writeConfigs(configs));

  const updateConfigs: MainPersistence["updateConfigs"] = (change) =>
    enqueue(async () => {
      const next = change(await readConfigs());
      if (next) await writeConfigs(next);
    });

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

  const loadAppConfig = () =>
    enqueue(() =>
      readSettings<AppConfig>(
        appConfigPath,
        (json) => {
          if (!json || typeof json !== "object" || Array.isArray(json))
            throw new CorruptFileError();
          const parsed = json as Partial<AppConfig>;
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
        },
        () => ({ ...DEFAULT_APP_CONFIG }),
      ),
    );

  const saveAppConfig = (config: AppConfig) =>
    enqueue(() =>
      writeFileAtomic(appConfigPath, JSON.stringify(config, null, 2)),
    );

  return {
    configPath,
    pageSizesPath,
    appConfigPath,
    loadConfigs,
    saveConfigs,
    updateConfigs,
    loadPageSizes,
    loadAppConfig,
    saveAppConfig,
  };
}
