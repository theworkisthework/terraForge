import { dialog, ipcMain, type BrowserWindow } from "electron";
import { readFile, writeFile } from "fs/promises";
import type { MachineConfig } from "../../types";

export interface FsIpcOptions {
  getMainWindow: () => BrowserWindow | null;
  loadConfigs: () => Promise<MachineConfig[]>;
  saveConfigs: (configs: MachineConfig[]) => Promise<void>;
}

export function registerFsIpcHandlers(options: FsIpcOptions): void {
  const { getMainWindow, loadConfigs, saveConfigs } = options;

  ipcMain.handle("fs:openSvgDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import SVG",
      filters: [{ name: "SVG Files", extensions: ["svg"] }],
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("fs:openPdfDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import PDF",
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("fs:openFileDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select File to Upload",
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("fs:openImportDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import File",
      filters: [
        {
          name: "Supported Files",
          extensions: [
            "svg",
            "pdf",
            "gcode",
            "nc",
            "g",
            "gc",
            "gco",
            "ngc",
            "ncc",
            "cnc",
            "tap",
          ],
        },
        { name: "SVG Files", extensions: ["svg"] },
        { name: "PDF Files", extensions: ["pdf"] },
        {
          name: "G-code Files",
          extensions: [
            "gcode",
            "nc",
            "g",
            "gc",
            "gco",
            "ngc",
            "ncc",
            "cnc",
            "tap",
          ],
        },
      ],
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("fs:openGcodeDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import G-code",
      filters: [
        {
          name: "G-code Files",
          extensions: [
            "gcode",
            "nc",
            "g",
            "gc",
            "gco",
            "ngc",
            "ncc",
            "cnc",
            "tap",
          ],
        },
      ],
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("fs:readFile", (_e, filePath: string) =>
    readFile(filePath, "utf-8"),
  );

  // Returns raw bytes as a Buffer, which IPC transfers as Uint8Array in the renderer.
  ipcMain.handle("fs:readFileBinary", (_e, filePath: string) =>
    readFile(filePath),
  );

  ipcMain.handle("fs:writeFile", (_e, filePath: string, content: string) =>
    writeFile(filePath, content, "utf-8"),
  );

  ipcMain.handle("fs:saveGcodeDialog", async (_e, defaultName: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save G-code",
      defaultPath: defaultName,
      filters: [{ name: "G-code Files", extensions: ["gcode", "nc", "cnc"] }],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle("fs:saveFileDialog", async (_e, defaultName: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save File",
      defaultPath: defaultName,
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle("fs:saveLayoutDialog", async (_e, defaultName: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save Canvas Layout",
      defaultPath: defaultName,
      filters: [{ name: "terraForge Layout", extensions: ["tforge"] }],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle("fs:openLayoutDialog", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Open Canvas Layout",
      filters: [{ name: "terraForge Layout", extensions: ["tforge"] }],
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("fs:chooseDirectory", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose folder for G-code files",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle("fs:loadConfigs", () => loadConfigs());
  ipcMain.handle("fs:saveConfigs", (_e, configs: MachineConfig[]) =>
    saveConfigs(configs),
  );
}
