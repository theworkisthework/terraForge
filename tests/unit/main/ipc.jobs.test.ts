import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const listeners = new Map<string, (...args: any[]) => any>();
  return {
    handlers,
    listeners,
  };
});

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      mocks.handlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      mocks.listeners.set(channel, handler);
    }),
  },
}));

import { registerJobIpcHandlers } from "../../../src/main/ipc/jobs";

describe("registerJobIpcHandlers", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.listeners.clear();
  });

  it("creates a gcode task and returns delegated from generate handler", async () => {
    const taskManager = {
      create: vi.fn(),
    } as any;

    registerJobIpcHandlers(taskManager, vi.fn());

    await expect(
      mocks.handlers.get("jobs:generateGcode")?.({}, "task-1", [], {}, {}),
    ).resolves.toBe("delegated");
    expect(taskManager.create).toHaveBeenCalledWith(
      "task-1",
      "gcode-generate",
      "Generating G-code",
    );
  });

  it("forwards progress, completion, and failure task updates", () => {
    const taskManager = {
      update: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
      get: vi.fn((id: string) => ({ id })),
      create: vi.fn(),
    } as any;
    const safeSend = vi.fn();

    registerJobIpcHandlers(taskManager, safeSend);

    mocks.listeners.get("jobs:gcodeProgress")?.({}, "task-1", 42);
    mocks.listeners.get("jobs:gcodeComplete")?.({}, "task-1");
    mocks.listeners.get("jobs:gcodeFailed")?.({}, "task-1", "boom");

    expect(taskManager.update).toHaveBeenCalledWith("task-1", { progress: 42 });
    expect(taskManager.complete).toHaveBeenCalledWith("task-1");
    expect(taskManager.fail).toHaveBeenCalledWith("task-1", "boom");
    expect(safeSend).toHaveBeenCalledWith("task:update", { id: "task-1" });
    expect(safeSend).toHaveBeenCalledTimes(3);
  });
});
