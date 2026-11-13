import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type WindowOpenHandler = (details: { url: string }) => { action: string };
type NavigateHandler = (event: { url: string; preventDefault: () => void }) => void;

const mocks = vi.hoisted(() => {
  const instances: any[] = [];

  class MockBrowserWindow {
    options: Record<string, unknown>;
    onceHandlers = new Map<string, () => void>();
    onHandlers = new Map<string, () => void>();
    openHandler: WindowOpenHandler | null = null;
    navigateHandler: NavigateHandler | null = null;
    webContents: any;
    show: ReturnType<typeof vi.fn>;
    loadURL: ReturnType<typeof vi.fn>;
    loadFile: ReturnType<typeof vi.fn>;
    isDestroyed: ReturnType<typeof vi.fn>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.show = vi.fn();
      this.loadURL = vi.fn(() => mocks.loadResult());
      this.loadFile = vi.fn(() => mocks.loadResult());
      this.isDestroyed = vi.fn(() => false);
      this.webContents = {
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
        setWindowOpenHandler: vi.fn((handler: WindowOpenHandler) => {
          this.openHandler = handler;
        }),
        on: vi.fn((event: string, handler: NavigateHandler) => {
          if (event === "will-navigate") this.navigateHandler = handler;
        }),
        getURL: vi.fn(() => mocks.currentUrl),
      };
      instances.push(this);
    }

    once(event: string, handler: () => void) {
      this.onceHandlers.set(event, handler);
    }

    on(event: string, handler: () => void) {
      this.onHandlers.set(event, handler);
    }

    trigger(event: string) {
      this.onceHandlers.get(event)?.();
      this.onHandlers.get(event)?.();
    }
  }

  return {
    instances,
    /** What loading the window's page comes to. */
    loadResult: vi.fn((): Promise<void> => Promise.resolve()),
    /** The page the window has loaded. */
    currentUrl: "file:///opt/terraForge/out/renderer/index.html",
    BrowserWindow: MockBrowserWindow,
    openExternal: vi.fn((_url: string): Promise<void> => Promise.resolve()),
  };
});

vi.mock("electron", () => ({
  BrowserWindow: mocks.BrowserWindow,
  shell: {
    openExternal: mocks.openExternal,
  },
}));

import {
  createMainWindow,
  getMainWindow,
  safeSend,
} from "../../../src/main/bootstrap/window";

describe("main window bootstrap", () => {
  const originalRendererUrl = process.env.ELECTRON_RENDERER_URL;

  beforeEach(() => {
    mocks.instances.length = 0;
    mocks.openExternal.mockReset();
    mocks.openExternal.mockResolvedValue(undefined);
    mocks.currentUrl = "file:///opt/terraForge/out/renderer/index.html";
    delete process.env.ELECTRON_RENDERER_URL;
  });

  afterEach(() => {
    if (getMainWindow()) {
      (getMainWindow() as any).trigger("closed");
    }
    if (originalRendererUrl) {
      process.env.ELECTRON_RENDERER_URL = originalRendererUrl;
    } else {
      delete process.env.ELECTRON_RENDERER_URL;
    }
  });

  it("creates a browser window and loads the dev server URL when provided", () => {
    process.env.ELECTRON_RENDERER_URL = "http://localhost:5173";

    const win = createMainWindow() as any;
    win.trigger("ready-to-show");

    expect(win.options.minWidth).toBe(1024);
    expect(win.options.minHeight).toBe(700);
    expect((win.options.webPreferences as any).preload).toMatch(
      /preload[\\/]index\.js$/,
    );
    expect(win.loadURL).toHaveBeenCalledWith("http://localhost:5173");
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(getMainWindow()).toBe(win);
  });

  it("loads the packaged renderer file and safely forwards messages", () => {
    const win = createMainWindow() as any;

    expect(win.loadFile).toHaveBeenCalledWith(
      expect.stringMatching(/renderer[\\/]index\.html$/),
    );

    safeSend("channel:name", 1, "two");
    expect(win.webContents.send).toHaveBeenCalledWith("channel:name", 1, "two");

    win.isDestroyed.mockReturnValue(true);
    safeSend("ignored");
    expect(win.webContents.send).toHaveBeenCalledTimes(1);
  });

  it("does not treat a load cut short by a reload or a close as a failure", async () => {
    // Left unhandled, this rejection would fail the test run.
    mocks.loadResult.mockReturnValueOnce(Promise.reject(Object.assign(new Error("ERR_ABORTED (-3)"), { code: "ERR_ABORTED" })));
    createMainWindow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("runs the window sandboxed, isolated and without Node", () => {
    const win = createMainWindow() as any;

    expect(win.options.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
  });

  it("opens a link in the browser instead of a new window, and clears mainWindow on close", () => {
    const win = createMainWindow() as any;

    const result = win.openHandler?.({ url: "https://example.com/docs" });
    expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/docs");
    expect(result).toEqual({ action: "deny" });

    win.trigger("closed");
    expect(getMainWindow()).toBeNull();
  });

  it.each(["file:///etc/passwd", "http://example.com", "javascript:alert(1)", "smb://server/share", "about:blank"])(
    "opens neither a window nor the browser for %s",
    (url) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const win = createMainWindow() as any;

      expect(win.openHandler?.({ url })).toEqual({ action: "deny" });
      expect(mocks.openExternal).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(url));
      warn.mockRestore();
    },
  );

  it("does not let a link that fails to open become an unhandled rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Left unhandled, this rejection would fail the test run.
    mocks.openExternal.mockRejectedValueOnce(new Error("no browser"));
    const win = createMainWindow() as any;

    win.openHandler?.({ url: "https://example.com/" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("https://example.com/"), expect.any(Error));
    warn.mockRestore();
  });

  describe("navigation", () => {
    const navigate = (win: any, url: string) => {
      const event = { url, preventDefault: vi.fn() };
      win.navigateHandler?.(event);
      return event;
    };

    it("lets the window reload its own page", () => {
      const win = createMainWindow() as any;

      expect(navigate(win, mocks.currentUrl).preventDefault).not.toHaveBeenCalled();
      expect(navigate(win, `${mocks.currentUrl}#section`).preventDefault).not.toHaveBeenCalled();
      expect(mocks.openExternal).not.toHaveBeenCalled();
    });

    it("lets the dev server's page reload", () => {
      mocks.currentUrl = "http://localhost:5173/";
      const win = createMainWindow() as any;

      expect(navigate(win, "http://localhost:5173/").preventDefault).not.toHaveBeenCalled();
    });

    it("keeps the window on the app when a file is dropped on it", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const win = createMainWindow() as any;

      expect(navigate(win, "file:///home/user/drawing.svg").preventDefault).toHaveBeenCalledTimes(1);
      expect(mocks.openExternal).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("keeps the window on the app and sends a web link to the browser", () => {
      const win = createMainWindow() as any;

      expect(navigate(win, "https://example.com/docs").preventDefault).toHaveBeenCalledTimes(1);
      expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/docs");
    });

    it.each([
      "file:///opt/terraForge/out/renderer/other.html",
      "file:///opt/terraForge/out/renderer/index.html?x=1",
      "http://localhost:5173/",
      "javascript:alert(1)",
      "not a url",
    ])("blocks %s", (url) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const win = createMainWindow() as any;

      expect(navigate(win, url).preventDefault).toHaveBeenCalledTimes(1);
      expect(mocks.openExternal).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("blocks everything before a page has loaded", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mocks.currentUrl = "";
      const win = createMainWindow() as any;

      expect(navigate(win, "file:///opt/terraForge/out/renderer/index.html").preventDefault).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });
});
