import { BrowserWindow } from "electron";
import { join } from "path";
import { isAllowedExternalUrl, openExternalUrl } from "../security/externalLinks";

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

/** Opens a link in the browser if it is a kind that may be; never throws. */
function openLink(url: string): void {
  if (!isAllowedExternalUrl(url)) {
    console.warn(`Blocked a link the app does not open: ${url}`);
    return;
  }
  void openExternalUrl(url).catch((err) => console.warn(`Could not open ${url}:`, err));
}

/** Whether `url` is the page already loaded — a reload, not a move elsewhere. */
function isSamePage(url: string, current: string): boolean {
  try {
    const target = new URL(url);
    const loaded = new URL(current);
    target.hash = "";
    loaded.hash = "";
    return target.href === loaded.href;
  } catch {
    return false;
  }
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
      // The preload only uses `contextBridge` and `ipcRenderer`, which a
      // sandboxed preload may; everything else goes through the main process.
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  // The window only ever shows the app. A link that would open a new window
  // goes to the browser instead, and nothing may take this window elsewhere:
  // a page from anywhere else would be handed the preload's API. A file
  // dropped on the window is the everyday case — Chromium would navigate to
  // it. Reloading the app itself is still allowed.
  const { webContents } = mainWindow;
  webContents.setWindowOpenHandler(({ url }) => {
    openLink(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event) => {
    if (isSamePage(event.url, webContents.getURL())) return;
    event.preventDefault();
    openLink(event.url);
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
