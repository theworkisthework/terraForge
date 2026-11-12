import { BrowserWindow, shell } from "electron";
import { join } from "path";

let mainWindow: BrowserWindow | null = null;

function resolveWindowIconPath(): string {
  return join(
    __dirname,
    process.platform === "win32"
      ? "../../build/icon.ico"
      : process.platform === "darwin"
        ? "../../build/icon.icns"
        : "../../build/icon.png",
  );
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#1a1a2e",
    icon: resolveWindowIconPath(),
    // Use a standard framed title bar on macOS so traffic lights stay in
    // native chrome instead of overlapping renderer content.
    titleBarStyle: "default",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const loaded = process.env.ELECTRON_RENDERER_URL
    ? mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    : mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  // A load cut short — by a reload, or by the window closing — is not a
  // failure. Anything else is left unhandled, to be reported as one.
  void loaded.catch((err: { code?: string } | undefined) => {
    if (err?.code !== "ERR_ABORTED") throw err;
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function safeSend(channel: string, ...args: unknown[]): void {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isDestroyed()
  ) {
    return;
  }

  mainWindow.webContents.send(channel, ...args);
}
