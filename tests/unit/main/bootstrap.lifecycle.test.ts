import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => void>();
  return {
    handlers,
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
    getAllWindows: vi.fn((): unknown[] => []),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, handler);
    }),
  };
});

vi.mock("electron", () => ({
  app: {
    whenReady: mocks.whenReady,
    on: mocks.on,
    quit: mocks.quit,
  },
  BrowserWindow: {
    getAllWindows: mocks.getAllWindows,
  },
}));

import { registerAppLifecycleHandlers } from "../../../src/main/bootstrap/lifecycle";
import { markPluginHostWindow } from "../../../src/main/plugins/pluginHostWindows";

/** A hidden renderer-plugin host window, as PluginHostManager marks them. */
function pluginHostWindow(): any {
  const win = { on: vi.fn() };
  markPluginHostWindow(win as any);
  return win;
}

describe("registerAppLifecycleHandlers", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    mocks.handlers.clear();
    mocks.whenReady.mockClear();
    mocks.quit.mockClear();
    mocks.getAllWindows.mockReset();
    mocks.getAllWindows.mockReturnValue([]);
    mocks.on.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
  }

  it("creates the main window on app ready and runs onReady callback", async () => {
    const createMainWindow = vi.fn();
    const onReady = vi.fn();

    registerAppLifecycleHandlers({ createMainWindow, onReady });
    await Promise.resolve();

    expect(createMainWindow).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("recreates the window on activate only when all windows are closed", async () => {
    const createMainWindow = vi.fn();

    registerAppLifecycleHandlers({ createMainWindow });
    await Promise.resolve();

    mocks.getAllWindows.mockReturnValue([{}]);
    mocks.handlers.get("activate")?.();

    mocks.getAllWindows.mockReturnValue([]);
    mocks.handlers.get("activate")?.();

    expect(createMainWindow).toHaveBeenCalledTimes(2);
  });

  it("does not count hidden plugin host windows as open app windows", async () => {
    const createMainWindow = vi.fn();

    registerAppLifecycleHandlers({ createMainWindow });
    await Promise.resolve();

    // A warm plugin host is still open, but the user sees no window — the
    // dock icon must still bring the app back.
    mocks.getAllWindows.mockReturnValue([pluginHostWindow()]);
    mocks.handlers.get("activate")?.();

    expect(createMainWindow).toHaveBeenCalledTimes(2);
  });

  it("signals when the last visible window closes, ignoring plugin hosts", async () => {
    const onAllAppWindowsClosed = vi.fn();

    registerAppLifecycleHandlers({ createMainWindow: vi.fn(), onAllAppWindowsClosed });
    await Promise.resolve();

    const listeners = new Map<string, () => void>();
    const mainWindow = { on: (event: string, cb: () => void) => listeners.set(event, cb) };
    mocks.handlers.get("browser-window-created")?.({}, mainWindow);

    // Only a hidden plugin host remains once the main window closes.
    mocks.getAllWindows.mockReturnValue([pluginHostWindow()]);
    listeners.get("closed")?.();

    expect(onAllAppWindowsClosed).toHaveBeenCalledTimes(1);
  });

  it("does not watch plugin host windows for close", async () => {
    registerAppLifecycleHandlers({ createMainWindow: vi.fn(), onAllAppWindowsClosed: vi.fn() });
    await Promise.resolve();

    const win = pluginHostWindow();
    mocks.handlers.get("browser-window-created")?.({}, win);

    expect(win.on).not.toHaveBeenCalled();
  });

  it("quits on window-all-closed and runs onBeforeQuit callback", async () => {
    const onBeforeQuit = vi.fn();
    setPlatform("win32");

    registerAppLifecycleHandlers({
      createMainWindow: vi.fn(),
      onBeforeQuit,
    });
    await Promise.resolve();

    mocks.handlers.get("window-all-closed")?.();
    mocks.handlers.get("before-quit")?.();

    expect(mocks.quit).toHaveBeenCalledTimes(1);
    expect(onBeforeQuit).toHaveBeenCalledTimes(1);
  });

  it("holds a quit that needs confirming, and quits only on a yes", async () => {
    const onBeforeQuit = vi.fn();
    let answer!: (quit: boolean) => void;
    const confirmQuit = vi.fn((): Promise<boolean> | null => new Promise((resolve) => (answer = resolve)));
    registerAppLifecycleHandlers({ createMainWindow: vi.fn(), confirmQuit, onBeforeQuit });
    await Promise.resolve();

    const event = { preventDefault: vi.fn() };
    mocks.handlers.get("before-quit")?.(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    // The machine connection must survive a quit the user may yet cancel.
    expect(onBeforeQuit).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();

    answer(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.quit).toHaveBeenCalledTimes(1);

    // The quit that follows finds nothing left to confirm.
    confirmQuit.mockReturnValue(null);
    const second = { preventDefault: vi.fn() };
    mocks.handlers.get("before-quit")?.(second);
    expect(second.preventDefault).not.toHaveBeenCalled();
    expect(onBeforeQuit).toHaveBeenCalledTimes(1);
  });

  it("stays open when a held quit is refused", async () => {
    const onBeforeQuit = vi.fn();
    registerAppLifecycleHandlers({
      createMainWindow: vi.fn(),
      confirmQuit: () => Promise.resolve(false),
      onBeforeQuit,
    });
    await Promise.resolve();

    const event = { preventDefault: vi.fn() };
    mocks.handlers.get("before-quit")?.(event);
    await Promise.resolve();
    await Promise.resolve();

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(onBeforeQuit).not.toHaveBeenCalled();
  });

  it("does not quit on window-all-closed on macOS", async () => {
    setPlatform("darwin");

    registerAppLifecycleHandlers({
      createMainWindow: vi.fn(),
    });
    await Promise.resolve();

    mocks.handlers.get("window-all-closed")?.();

    expect(mocks.quit).not.toHaveBeenCalled();
  });
});
