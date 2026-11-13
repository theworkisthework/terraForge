import { dialog, ipcMain, type BrowserWindow } from "electron";
import { readFile, writeFile } from "fs/promises";
import type { MachineConfig } from "../../types";
import type { PathGrants } from "../security/pathGrants";

const GCODE_EXTENSIONS = [
  "gcode",
  "nc",
  "g",
  "gc",
  "gco",
  "ngc",
  "ncc",
  "cnc",
  "tap",
];

const BITMAP_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

const IMPORT_FILTERS = [
  {
    name: "Supported Files",
    extensions: ["svg", "pdf", ...BITMAP_EXTENSIONS, ...GCODE_EXTENSIONS],
  },
  { name: "SVG Files", extensions: ["svg"] },
  { name: "PDF Files", extensions: ["pdf"] },
  { name: "Bitmap Files", extensions: BITMAP_EXTENSIONS },
  { name: "G-code Files", extensions: GCODE_EXTENSIONS },
];

/**
 * Bitmap import is an experimental, user-togglable feature (see
 * `appConfigStore`'s `bitmapRendererEnabled`) — when it's off, the dialog
 * must not let a user pick a bitmap file at all, not just decline to import
 * whatever they picked, so this strips bitmap extensions out of every
 * filter rather than just dropping the dedicated "Bitmap Files" entry.
 */
function buildImportFilters(allowBitmap: boolean): typeof IMPORT_FILTERS {
  if (allowBitmap) return IMPORT_FILTERS;
  return IMPORT_FILTERS.filter((filter) => filter.name !== "Bitmap Files").map((filter) => ({
    ...filter,
    extensions: filter.extensions.filter((ext) => !BITMAP_EXTENSIONS.includes(ext)),
  }));
}

export interface FsIpcOptions {
  getMainWindow: () => BrowserWindow | null;
  loadConfigs: () => Promise<MachineConfig[]>;
  saveConfigs: (configs: MachineConfig[]) => Promise<void>;
  /**
   * The files the window may read and write. A dialog here adds what the
   * user picked; `fs:readFile` and the rest accept nothing else.
   */
  pathGrants: PathGrants;
}

export function registerFsIpcHandlers(options: FsIpcOptions): void {
  const { getMainWindow, loadConfigs, saveConfigs, pathGrants } = options;

  /** The file picked in an open dialog, now readable. */
  const picked = (result: Electron.OpenDialogReturnValue): string | null | undefined => {
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    if (filePath) pathGrants.grantRead(filePath);
    return filePath;
  };

  /** The file named in a save dialog, now writable. */
  const pickedForSaving = (result: Electron.SaveDialogReturnValue): string | null | undefined => {
    if (result.canceled) return null;
    if (result.filePath) pathGrants.grantWrite(result.filePath);
    return result.filePath;
  };

  ipcMain.handle("fs:openSvgDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import SVG",
      filters: [{ name: "SVG Files", extensions: ["svg"] }],
      properties: ["openFile"],
    });
    return picked(result);
  });

  ipcMain.handle("fs:openPdfDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import PDF",
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      properties: ["openFile"],
    });
    return picked(result);
  });

  ipcMain.handle("fs:openFileDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select File to Upload",
      properties: ["openFile"],
    });
    return picked(result);
  });

  ipcMain.handle("fs:openImportDialog", async (_event, opts?: { allowBitmap?: boolean }) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import File",
      filters: buildImportFilters(opts?.allowBitmap ?? true),
      properties: ["openFile"],
    });
    return picked(result);
  });

  ipcMain.handle("fs:openGcodeDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import G-code",
      filters: [{ name: "G-code Files", extensions: GCODE_EXTENSIONS }],
      properties: ["openFile"],
    });
    return picked(result);
  });

  // These three take a path from the window, and reject any the user did
  // not pick in one of the dialogs here. See pathGrants.
  ipcMain.handle("fs:readFile", async (_e, filePath: unknown) =>
    readFile(pathGrants.check(filePath, "read"), "utf-8"),
  );

  // Returns raw bytes as a Buffer, which IPC transfers as Uint8Array in the renderer.
  ipcMain.handle("fs:readFileBinary", async (_e, filePath: unknown) =>
    readFile(pathGrants.check(filePath, "read")),
  );

  ipcMain.handle("fs:writeFile", async (_e, filePath: unknown, content: string) =>
    writeFile(pathGrants.check(filePath, "write"), content, "utf-8"),
  );

  ipcMain.handle("fs:saveGcodeDialog", async (_e, defaultName: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save G-code",
      defaultPath: defaultName,
      filters: [{ name: "G-code Files", extensions: ["gcode", "nc", "cnc"] }],
    });
    return pickedForSaving(result);
  });

  ipcMain.handle("fs:saveFileDialog", async (_e, defaultName: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save File",
      defaultPath: defaultName,
    });
    return pickedForSaving(result);
  });

  ipcMain.handle("fs:saveLayoutDialog", async (_e, defaultName: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save Canvas Layout",
      defaultPath: defaultName,
      filters: [{ name: "terraForge Layout", extensions: ["tforge"] }],
    });
    return pickedForSaving(result);
  });

  ipcMain.handle("fs:openLayoutDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Open Canvas Layout",
      filters: [{ name: "terraForge Layout", extensions: ["tforge"] }],
      properties: ["openFile"],
    });
    return picked(result);
  });

  ipcMain.handle("fs:saveBedMeshDialog", async (_e, defaultName: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save Bed Mesh Profile",
      defaultPath: defaultName.endsWith(".json") ? defaultName : `${defaultName}.json`,
      filters: [{ name: "Bed Mesh JSON", extensions: ["json"] }],
    });
    return pickedForSaving(result);
  });

  ipcMain.handle("fs:openBedMeshDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import Bed Mesh Profile",
      filters: [{ name: "Bed Mesh JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    return picked(result);
  });

  ipcMain.handle("fs:chooseDirectory", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose folder for G-code files",
      properties: ["openDirectory", "createDirectory"],
    });
    const directory = result.canceled ? null : (result.filePaths[0] ?? null);
    if (directory) pathGrants.grantDirectory(directory);
    return directory;
  });

  ipcMain.handle("fs:loadConfigs", () => loadConfigs());
  ipcMain.handle("fs:saveConfigs", (_e, configs: MachineConfig[]) =>
    saveConfigs(configs),
  );
}
