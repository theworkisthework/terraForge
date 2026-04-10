import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  return {
    handlers,
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  };
});

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      mocks.handlers.set(channel, handler);
    }),
  },
  dialog: {
    showOpenDialog: mocks.showOpenDialog,
    showSaveDialog: mocks.showSaveDialog,
  },
}));

import { registerFsIpcHandlers } from "../../../src/main/ipc/fs";

describe("registerFsIpcHandlers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "terraforge-fs-ipc-"));
    mocks.handlers.clear();
    mocks.showOpenDialog.mockReset();
    mocks.showSaveDialog.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null for open dialogs when no main window exists", async () => {
    registerFsIpcHandlers({
      getMainWindow: () => null,
      loadConfigs: vi.fn().mockResolvedValue([]),
      saveConfigs: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      mocks.handlers.get("fs:openSvgDialog")?.(),
    ).resolves.toBeNull();
    await expect(
      mocks.handlers.get("fs:openImportDialog")?.(),
    ).resolves.toBeNull();
    expect(mocks.showOpenDialog).not.toHaveBeenCalled();
  });

  it("passes expected import/gcode filters to open dialogs", async () => {
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["chosen.file"],
    });

    registerFsIpcHandlers({
      getMainWindow: () => ({}) as any,
      loadConfigs: vi.fn().mockResolvedValue([]),
      saveConfigs: vi.fn().mockResolvedValue(undefined),
    });

    await expect(mocks.handlers.get("fs:openImportDialog")?.()).resolves.toBe(
      "chosen.file",
    );
    await expect(mocks.handlers.get("fs:openGcodeDialog")?.()).resolves.toBe(
      "chosen.file",
    );

    expect(mocks.showOpenDialog.mock.calls[0][1].filters).toHaveLength(4);
    expect(mocks.showOpenDialog.mock.calls[1][1].filters[0].name).toBe(
      "G-code Files",
    );
  });

  it("reads and writes text and binary files through IPC handlers", async () => {
    const filePath = join(tempDir, "sample.txt");

    registerFsIpcHandlers({
      getMainWindow: () => ({}) as any,
      loadConfigs: vi.fn().mockResolvedValue([]),
      saveConfigs: vi.fn().mockResolvedValue(undefined),
    });

    await mocks.handlers.get("fs:writeFile")?.({}, filePath, "hello");
    await expect(
      mocks.handlers.get("fs:readFile")?.({}, filePath),
    ).resolves.toBe("hello");
    await expect(
      mocks.handlers.get("fs:readFileBinary")?.({}, filePath),
    ).resolves.toEqual(Buffer.from("hello"));
  });

  it("delegates load/save configs and save dialog results", async () => {
    const loadConfigs = vi.fn().mockResolvedValue([{ id: "cfg" }]);
    const saveConfigs = vi.fn().mockResolvedValue(undefined);
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: "out.gcode",
    });

    registerFsIpcHandlers({
      getMainWindow: () => ({}) as any,
      loadConfigs,
      saveConfigs,
    });

    await expect(
      mocks.handlers.get("fs:saveGcodeDialog")?.({}, "job.gcode"),
    ).resolves.toBe("out.gcode");
    await expect(mocks.handlers.get("fs:loadConfigs")?.()).resolves.toEqual([
      { id: "cfg" },
    ]);
    await mocks.handlers.get("fs:saveConfigs")?.({}, [{ id: "saved" }]);

    expect(loadConfigs).toHaveBeenCalledTimes(1);
    expect(saveConfigs).toHaveBeenCalledWith([{ id: "saved" }]);
  });
});
