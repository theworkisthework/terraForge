import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => void>();
  return {
    handlers,
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
    getAllWindows: vi.fn(() => []),
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

describe("registerAppLifecycleHandlers", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.whenReady.mockClear();
    mocks.quit.mockClear();
    mocks.getAllWindows.mockReset();
    mocks.getAllWindows.mockReturnValue([]);
    mocks.on.mockClear();
  });

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

  it("quits on window-all-closed and runs onBeforeQuit callback", async () => {
    const onBeforeQuit = vi.fn();

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
});
