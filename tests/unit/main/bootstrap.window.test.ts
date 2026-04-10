import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type WindowOpenHandler = (details: { url: string }) => { action: string };

const mocks = vi.hoisted(() => {
  const instances: any[] = [];

  class MockBrowserWindow {
    options: Record<string, unknown>;
    onceHandlers = new Map<string, () => void>();
    onHandlers = new Map<string, () => void>();
    openHandler: WindowOpenHandler | null = null;
    webContents: any;
    show: ReturnType<typeof vi.fn>;
    loadURL: ReturnType<typeof vi.fn>;
    loadFile: ReturnType<typeof vi.fn>;
    isDestroyed: ReturnType<typeof vi.fn>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.show = vi.fn();
      this.loadURL = vi.fn();
      this.loadFile = vi.fn();
      this.isDestroyed = vi.fn(() => false);
      this.webContents = {
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
        setWindowOpenHandler: vi.fn((handler: WindowOpenHandler) => {
          this.openHandler = handler;
        }),
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
    BrowserWindow: MockBrowserWindow,
    openExternal: vi.fn(),
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

  it("denies external window opens and clears mainWindow on close", () => {
    const win = createMainWindow() as any;

    const result = win.openHandler?.({ url: "https://example.com" });
    expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com");
    expect(result).toEqual({ action: "deny" });

    win.trigger("closed");
    expect(getMainWindow()).toBeNull();
  });
});
