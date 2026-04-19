import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  return {
    handlers,
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
    openPath: vi.fn(),
  };
});

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => {
      mocks.handlers.set(channel, fn);
    }),
  },
  dialog: {
    showSaveDialog: mocks.showSaveDialog,
    showOpenDialog: mocks.showOpenDialog,
  },
  shell: {
    openPath: mocks.openPath,
  },
}));

import { registerConfigIpcHandlers } from "../../../src/main/ipc/config";

describe("registerConfigIpcHandlers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "terraforge-config-ipc-"));
    mocks.handlers.clear();
    mocks.showSaveDialog.mockReset();
    mocks.showOpenDialog.mockReset();
    mocks.openPath.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeConfig(id: string, name: string) {
    return {
      id,
      name,
      bedWidth: 220,
      bedHeight: 200,
      connection: { type: "wifi", host: "fluidnc.local", port: 80 },
      penDownDelayMs: 0,
      jogSpeed: 3000,
      drawSpeed: 3000,
    };
  }

  it("updates an existing machine config by id", async () => {
    const existing = makeConfig("cfg-1", "Original");
    const updated = { ...existing, name: "Updated" };
    const loadConfigs = vi.fn().mockResolvedValue([existing]);
    const saveConfigs = vi.fn().mockResolvedValue(undefined);

    registerConfigIpcHandlers({
      getMainWindow: () => ({}) as any,
      loadConfigs,
      saveConfigs,
      loadPageSizes: vi.fn().mockResolvedValue([]),
      pageSizesPath: join(tempDir, "page-sizes.json"),
      builtInPageSizes: [],
    });

    await mocks.handlers.get("config:saveMachineConfig")?.({}, updated);

    expect(saveConfigs).toHaveBeenCalledWith([updated]);
  });

  it("appends a new machine config when the id does not exist", async () => {
    const existing = makeConfig("cfg-1", "Original");
    const created = makeConfig("cfg-2", "Created");
    const loadConfigs = vi.fn().mockResolvedValue([existing]);
    const saveConfigs = vi.fn().mockResolvedValue(undefined);

    registerConfigIpcHandlers({
      getMainWindow: () => ({}) as any,
      loadConfigs,
      saveConfigs,
      loadPageSizes: vi.fn().mockResolvedValue([]),
      pageSizesPath: join(tempDir, "page-sizes.json"),
      builtInPageSizes: [],
    });

    await mocks.handlers.get("config:saveMachineConfig")?.({}, created);

    expect(saveConfigs).toHaveBeenCalledWith([existing, created]);
  });

  it("deletes a machine config by id", async () => {
    const cfg1 = makeConfig("cfg-1", "One");
    const cfg2 = makeConfig("cfg-2", "Two");
    const loadConfigs = vi.fn().mockResolvedValue([cfg1, cfg2]);
    const saveConfigs = vi.fn().mockResolvedValue(undefined);

    registerConfigIpcHandlers({
      getMainWindow: () => ({}) as any,
      loadConfigs,
      saveConfigs,
      loadPageSizes: vi.fn().mockResolvedValue([]),
      pageSizesPath: join(tempDir, "page-sizes.json"),
      builtInPageSizes: [],
    });

    await mocks.handlers.get("config:deleteMachineConfig")?.({}, "cfg-1");

    expect(saveConfigs).toHaveBeenCalledWith([cfg2]);
  });

  it("imports configs with dedupe by id and normalized name", async () => {
    const existing = makeConfig("existing-id", "Alpha Plotter");
    const incoming = [
      makeConfig("existing-id", "Different Name"),
      makeConfig("new-1", "alpha plotter"),
      makeConfig("new-2", "Beta Plotter"),
      makeConfig("new-3", "Gamma Plotter"),
    ];

    const importFilePath = join(tempDir, "import.json");
    await writeFile(
      importFilePath,
      JSON.stringify({ configs: incoming }),
      "utf-8",
    );

    const loadConfigs = vi.fn().mockResolvedValue([existing]);
    const saveConfigs = vi.fn().mockResolvedValue(undefined);
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [importFilePath],
    });

    registerConfigIpcHandlers({
      getMainWindow: () => ({}) as any,
      loadConfigs,
      saveConfigs,
      loadPageSizes: vi.fn().mockResolvedValue([]),
      pageSizesPath: join(tempDir, "page-sizes.json"),
      builtInPageSizes: [],
    });

    const result = await mocks.handlers.get("config:importConfigs")?.();

    expect(result).toEqual({ added: 2, skipped: 2 });
    expect(saveConfigs).toHaveBeenCalledTimes(1);
    const saved = saveConfigs.mock.calls[0][0];
    expect(saved).toHaveLength(3);
    expect(saved.map((c: any) => c.id)).toEqual([
      "existing-id",
      "new-2",
      "new-3",
    ]);
  });

  it("exports configs to the selected file", async () => {
    const exportedPath = join(tempDir, "export.json");
    const loadConfigs = vi
      .fn()
      .mockResolvedValue([makeConfig("cfg-1", "Exported")]);
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: exportedPath,
    });

    registerConfigIpcHandlers({
      getMainWindow: () => ({}) as any,
      loadConfigs,
      saveConfigs: vi.fn().mockResolvedValue(undefined),
      loadPageSizes: vi.fn().mockResolvedValue([]),
      pageSizesPath: join(tempDir, "page-sizes.json"),
      builtInPageSizes: [],
    });

    const result = await mocks.handlers.get("config:exportConfigs")?.();

    expect(result).toBe(exportedPath);
    const payload = JSON.parse(await readFile(exportedPath, "utf-8"));
    expect(payload.terraForge).toBe("machine-configs");
    expect(payload.configs).toHaveLength(1);
  });

  it("throws for invalid import JSON", async () => {
    const importFilePath = join(tempDir, "invalid.json");
    await writeFile(importFilePath, "{not json", "utf-8");
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [importFilePath],
    });

    registerConfigIpcHandlers({
      getMainWindow: () => ({}) as any,
      loadConfigs: vi.fn().mockResolvedValue([]),
      saveConfigs: vi.fn().mockResolvedValue(undefined),
      loadPageSizes: vi.fn().mockResolvedValue([]),
      pageSizesPath: join(tempDir, "page-sizes.json"),
      builtInPageSizes: [],
    });

    await expect(
      mocks.handlers.get("config:importConfigs")?.(),
    ).rejects.toThrow("Not a valid JSON file.");
  });

  it("creates page-sizes file on open if it does not exist", async () => {
    const pageSizesPath = join(tempDir, "page-sizes.json");
    const builtInPageSizes = [
      { id: "a4", name: "A4", widthMM: 210, heightMM: 297 },
    ];

    registerConfigIpcHandlers({
      getMainWindow: () => ({}) as any,
      loadConfigs: vi.fn().mockResolvedValue([]),
      saveConfigs: vi.fn().mockResolvedValue(undefined),
      loadPageSizes: vi.fn().mockResolvedValue([]),
      pageSizesPath,
      builtInPageSizes,
    });

    await mocks.handlers.get("config:openPageSizesFile")?.();

    expect(mocks.openPath).toHaveBeenCalledWith(pageSizesPath);
    const fileContents = await readFile(pageSizesPath, "utf-8");
    expect(JSON.parse(fileContents)).toEqual(builtInPageSizes);
  });
});
