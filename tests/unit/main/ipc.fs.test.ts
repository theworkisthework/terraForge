import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
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
import { createPathGrants } from "../../../src/main/security/pathGrants";

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
      pathGrants: createPathGrants(),
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
      pathGrants: createPathGrants(),
    });

    await expect(mocks.handlers.get("fs:openImportDialog")?.()).resolves.toBe(
      "chosen.file",
    );
    await expect(mocks.handlers.get("fs:openGcodeDialog")?.()).resolves.toBe(
      "chosen.file",
    );

    expect(mocks.showOpenDialog.mock.calls[0][1].filters).toHaveLength(5);
    expect(mocks.showOpenDialog.mock.calls[1][1].filters[0].name).toBe(
      "G-code Files",
    );
  });

  it("strips bitmap extensions from every filter when bitmap import is disabled", async () => {
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["chosen.file"],
    });

    registerFsIpcHandlers({
      getMainWindow: () => ({}) as any,
      loadConfigs: vi.fn().mockResolvedValue([]),
      saveConfigs: vi.fn().mockResolvedValue(undefined),
      pathGrants: createPathGrants(),
    });

    await mocks.handlers.get("fs:openImportDialog")?.({}, { allowBitmap: false });

    const filters = mocks.showOpenDialog.mock.calls[0][1].filters;
    expect(filters.find((f: { name: string }) => f.name === "Bitmap Files")).toBeUndefined();
    const bitmapExtensions = ["png", "jpg", "jpeg", "webp"];
    for (const filter of filters as { extensions: string[] }[]) {
      for (const ext of bitmapExtensions) {
        expect(filter.extensions).not.toContain(ext);
      }
    }
  });

  describe("files named by the window", () => {
    const call = (channel: string, ...args: unknown[]) => mocks.handlers.get(channel)?.({}, ...args);

    beforeEach(() => {
      registerFsIpcHandlers({
        getMainWindow: () => ({}) as any,
        loadConfigs: vi.fn().mockResolvedValue([]),
        saveConfigs: vi.fn().mockResolvedValue(undefined),
        pathGrants: createPathGrants(),
      });
    });

    const pickToOpen = (filePath: string, channel = "fs:openImportDialog") => {
      mocks.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [filePath] });
      return call(channel);
    };
    const pickToSave = (filePath: string, channel = "fs:saveGcodeDialog") => {
      mocks.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath });
      return call(channel, "default");
    };

    it("writes a file the user named in a save dialog, and reads it back", async () => {
      const filePath = join(tempDir, "sample.txt");
      await pickToSave(filePath);

      await call("fs:writeFile", filePath, "hello");
      await expect(call("fs:readFile", filePath)).resolves.toBe("hello");
      await expect(call("fs:readFileBinary", filePath)).resolves.toEqual(Buffer.from("hello"));
    });

    it.each(["fs:saveGcodeDialog", "fs:saveFileDialog", "fs:saveLayoutDialog", "fs:saveBedMeshDialog"])("%s makes its file writable", async (channel) => {
      const filePath = join(tempDir, "saved.out");
      await pickToSave(filePath, channel);

      await call("fs:writeFile", filePath, "saved");
      await expect(readFile(filePath, "utf-8")).resolves.toBe("saved");
    });

    it.each(["fs:openSvgDialog", "fs:openPdfDialog", "fs:openFileDialog", "fs:openImportDialog", "fs:openGcodeDialog", "fs:openLayoutDialog", "fs:openBedMeshDialog"])(
      "%s makes its file readable",
      async (channel) => {
        const filePath = join(tempDir, "picked.in");
        await writeFile(filePath, "picked", "utf-8");
        await pickToOpen(filePath, channel);

        await expect(call("fs:readFile", filePath)).resolves.toBe("picked");
        await expect(call("fs:readFileBinary", filePath)).resolves.toEqual(Buffer.from("picked"));
      },
    );

    it("refuses to read a file the user did not pick", async () => {
      const filePath = join(tempDir, "secret.txt");
      await writeFile(filePath, "secret", "utf-8");

      await expect(call("fs:readFile", filePath)).rejects.toThrow(/not chosen in a file dialog/);
      await expect(call("fs:readFileBinary", filePath)).rejects.toThrow(/not chosen in a file dialog/);
    });

    it("refuses to write a file the user did not pick, and leaves it alone", async () => {
      const filePath = join(tempDir, "precious.txt");
      await writeFile(filePath, "precious", "utf-8");

      await expect(call("fs:writeFile", filePath, "overwritten")).rejects.toThrow(/not chosen in a file dialog/);
      await expect(readFile(filePath, "utf-8")).resolves.toBe("precious");
    });

    it("refuses to write over a file that was only picked for opening", async () => {
      const filePath = join(tempDir, "drawing.svg");
      await writeFile(filePath, "<svg/>", "utf-8");
      await pickToOpen(filePath);

      await expect(call("fs:writeFile", filePath, "overwritten")).rejects.toThrow(/not chosen in a file dialog/);
      await expect(readFile(filePath, "utf-8")).resolves.toBe("<svg/>");
    });

    it("does not let a picked file stand for another reached through it", async () => {
      const picked = join(tempDir, "picked.svg");
      const other = join(tempDir, "other.txt");
      await writeFile(picked, "<svg/>", "utf-8");
      await writeFile(other, "other", "utf-8");
      await pickToOpen(picked);

      await expect(call("fs:readFile", join(picked, "..", "other.txt"))).rejects.toThrow(/not chosen in a file dialog/);
    });

    it("grants nothing when a dialog is cancelled", async () => {
      const filePath = join(tempDir, "cancelled.txt");
      mocks.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath });
      await expect(call("fs:saveGcodeDialog", "default")).resolves.toBeNull();

      await expect(call("fs:writeFile", filePath, "x")).rejects.toThrow(/not chosen in a file dialog/);
    });

    it("writes files into a folder the user chose, but not into its subfolders or beside it", async () => {
      const chosen = join(tempDir, "plots");
      await mkdir(join(chosen, "nested"), { recursive: true });
      mocks.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [chosen] });
      await expect(call("fs:chooseDirectory")).resolves.toBe(chosen);

      // As the renderer builds it: the folder, a slash, the file's name.
      await call("fs:writeFile", `${chosen}/layer-1.gcode`, "G0");
      await expect(readFile(join(chosen, "layer-1.gcode"), "utf-8")).resolves.toBe("G0");

      await expect(call("fs:writeFile", join(chosen, "nested", "deep.gcode"), "G0")).rejects.toThrow(/not chosen/);
      await expect(call("fs:writeFile", `${chosen}/../escaped.gcode`, "G0")).rejects.toThrow(/not chosen/);
      await expect(call("fs:writeFile", join(tempDir, "beside.gcode"), "G0")).rejects.toThrow(/not chosen/);
    });

    it("does not let a chosen folder's files be read", async () => {
      const chosen = join(tempDir, "plots");
      await mkdir(chosen);
      await writeFile(join(chosen, "existing.txt"), "existing", "utf-8");
      mocks.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [chosen] });
      await call("fs:chooseDirectory");

      await expect(call("fs:readFile", join(chosen, "existing.txt"))).rejects.toThrow(/not chosen in a file dialog/);
    });

    it("refuses a path that is not a string", async () => {
      await expect(call("fs:readFile", undefined)).rejects.toThrow(/no path was given/);
      await expect(call("fs:writeFile", { path: "x" }, "x")).rejects.toThrow(/no path was given/);
    });
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
      pathGrants: createPathGrants(),
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
