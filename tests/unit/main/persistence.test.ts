import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  BUILT_IN_PAGE_SIZES,
  DEFAULT_APP_CONFIG,
  DEFAULT_MACHINE_CONFIGS,
  createPersistence,
  type CorruptFileReport,
} from "../../../src/main/config/persistence";

describe("main config persistence", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "terraforge-persist-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns cloned default machine configs when file is missing", async () => {
    const persistence = createPersistence(tempDir);

    const first = await persistence.loadConfigs();
    expect(first).toEqual([
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
        connection: { type: "wifi", host: "terrapen.local", port: 80 },
      },
    ]);

    first[0].connection.host = "mutated.local";

    const second = await persistence.loadConfigs();

    expect(second[0].connection.host).toBe("terrapen.local");
    expect(second).not.toBe(first);
  });

  describe("a machine's ink service stations", () => {
    const station = { id: "tray", name: "Tray", type: "dip", x: 150, y: 20, dwellMs: 300 };
    const storeConfig = (extra: Record<string, unknown>) =>
      writeFile(
        join(tempDir, "machine-configs.json"),
        JSON.stringify([{ ...DEFAULT_MACHINE_CONFIGS[0], ...extra }]),
        "utf-8",
      );

    it("are loaded and saved with its config", async () => {
      await storeConfig({ inkServiceStations: [station] });
      const persistence = createPersistence(tempDir);

      const [config] = await persistence.loadConfigs();
      expect(config.inkServiceStations).toEqual([station]);

      await persistence.saveConfigs([{ ...config, inkServiceStations: [{ ...station, x: 99 }] } as typeof config]);
      const [saved] = await persistence.loadConfigs();
      expect(saved.inkServiceStations?.[0].x).toBe(99);
    });

    it("lose entries that are not stations", async () => {
      await storeConfig({ inkServiceStations: [station, null, { id: "no-position", name: "x", type: "dip" }, "junk"] });
      const [config] = await createPersistence(tempDir).loadConfigs();
      expect(config.inkServiceStations).toEqual([station]);
    });

    it.each([["not a list", { stations: [] }], ["empty", []], ["all unusable", [null]]])(
      "are left out, for the defaults to apply, when %s",
      async (_case, value) => {
        await storeConfig({ inkServiceStations: value });
        const [config] = await createPersistence(tempDir).loadConfigs();
        expect(config).not.toHaveProperty("inkServiceStations");
      },
    );
  });

  it("creates page-sizes.json with defaults and returns cloned values", async () => {
    const persistence = createPersistence(tempDir);

    const first = await persistence.loadPageSizes();
    first[0].name = "Mutated";

    const second = await persistence.loadPageSizes();

    expect(second[0].name).toBe(BUILT_IN_PAGE_SIZES[0].name);
    expect(second).not.toBe(first);
  });

  it("falls back to built-in page sizes when page-sizes.json is malformed", async () => {
    const pageSizesPath = join(tempDir, "page-sizes.json");
    await writeFile(pageSizesPath, "{not-valid-json", "utf-8");

    const persistence = createPersistence(tempDir);
    const result = await persistence.loadPageSizes();

    expect(result).toHaveLength(BUILT_IN_PAGE_SIZES.length);
    expect(result).toEqual(BUILT_IN_PAGE_SIZES);
  });

  describe("saving", () => {
    it("round-trips machine configs and leaves no temporary file behind", async () => {
      const persistence = createPersistence(tempDir);
      const config = { ...DEFAULT_MACHINE_CONFIGS[0], id: "mine", name: "Mine" };

      await persistence.saveConfigs([config]);

      expect(await persistence.loadConfigs()).toEqual([config]);
      expect(await readdir(tempDir)).toEqual(["machine-configs.json"]);
    });

    it("round-trips the app config", async () => {
      const persistence = createPersistence(tempDir);

      await persistence.saveAppConfig({
        debugLoggingEnabled: true,
        showConsoleTimestamps: false,
      });

      expect(await persistence.loadAppConfig()).toEqual({
        debugLoggingEnabled: true,
        showConsoleTimestamps: false,
      });
      expect(await readdir(tempDir)).toEqual(["app-config.json"]);
    });

    it("applies updates made together one after another, losing none", async () => {
      const persistence = createPersistence(tempDir);
      await persistence.saveConfigs([]);
      const named = (id: string) => ({ ...DEFAULT_MACHINE_CONFIGS[0], id });

      // Without the queue each update would read the same empty list and
      // the last to save would win.
      await Promise.all(
        ["a", "b", "c", "d"].map((id) =>
          persistence.updateConfigs((configs) => [...configs, named(id)]),
        ),
      );

      const saved = await persistence.loadConfigs();
      expect(saved.map((config) => config.id)).toEqual(["a", "b", "c", "d"]);
    });

    it("does not write when an update returns null", async () => {
      const persistence = createPersistence(tempDir);

      await persistence.updateConfigs(() => null);

      expect(await readdir(tempDir)).toEqual([]);
    });

    it("keeps saving after an update throws", async () => {
      const persistence = createPersistence(tempDir);

      await expect(
        persistence.updateConfigs(() => {
          throw new Error("bad change");
        }),
      ).rejects.toThrow("bad change");
      await persistence.saveConfigs([]);

      expect(await persistence.loadConfigs()).toEqual([]);
    });
  });

  describe("a corrupt file", () => {
    const backupsIn = async (dir: string) =>
      (await readdir(dir)).filter((name) => name.endsWith(".bak"));

    it("is moved aside and reported, and defaults are used", async () => {
      const configPath = join(tempDir, "machine-configs.json");
      await writeFile(configPath, '[{"id":"mine","name":"Mi', "utf-8");
      const reports: CorruptFileReport[] = [];
      const persistence = createPersistence(tempDir, {
        onCorruptFile: (report) => reports.push(report),
      });

      const configs = await persistence.loadConfigs();

      expect(configs).toEqual(DEFAULT_MACHINE_CONFIGS);
      const backups = await backupsIn(tempDir);
      expect(backups).toHaveLength(1);
      expect(backups[0]).toMatch(/^machine-configs\.json\.\d{8}T\d{6}\.bak$/);
      expect(reports).toEqual([
        { path: configPath, backupPath: join(tempDir, backups[0]) },
      ]);
      // The damaged contents survive for recovery by hand
      expect(await readFile(join(tempDir, backups[0]), "utf-8")).toBe(
        '[{"id":"mine","name":"Mi',
      );
    });

    it("survives the save that follows", async () => {
      await writeFile(join(tempDir, "machine-configs.json"), "", "utf-8");
      const persistence = createPersistence(tempDir);

      await persistence.updateConfigs((configs) => configs);

      const [backup] = await backupsIn(tempDir);
      expect(await readFile(join(tempDir, backup), "utf-8")).toBe("");
      expect(await persistence.loadConfigs()).toEqual(DEFAULT_MACHINE_CONFIGS);
    });

    it("is reported once, not on every later load", async () => {
      await writeFile(join(tempDir, "machine-configs.json"), "{}", "utf-8");
      const reports: CorruptFileReport[] = [];
      const persistence = createPersistence(tempDir, {
        onCorruptFile: (report) => reports.push(report),
      });

      await persistence.loadConfigs();
      await persistence.loadConfigs();

      expect(reports).toHaveLength(1);
      expect(await backupsIn(tempDir)).toHaveLength(1);
    });

    it("applies to the app config too", async () => {
      await writeFile(join(tempDir, "app-config.json"), "not json", "utf-8");
      const reports: CorruptFileReport[] = [];
      const persistence = createPersistence(tempDir, {
        onCorruptFile: (report) => reports.push(report),
      });

      expect(await persistence.loadAppConfig()).toEqual(DEFAULT_APP_CONFIG);
      expect(reports).toHaveLength(1);
      expect(await backupsIn(tempDir)).toHaveLength(1);
    });

    it("does not set aside a readable file with unknown or missing fields", async () => {
      await writeFile(
        join(tempDir, "app-config.json"),
        JSON.stringify({ debugLoggingEnabled: true, somethingNew: 1 }),
        "utf-8",
      );
      const reports: CorruptFileReport[] = [];
      const persistence = createPersistence(tempDir, {
        onCorruptFile: (report) => reports.push(report),
      });

      expect(await persistence.loadAppConfig()).toEqual({
        debugLoggingEnabled: true,
        showConsoleTimestamps: true,
      });
      expect(reports).toEqual([]);
    });
  });
});
