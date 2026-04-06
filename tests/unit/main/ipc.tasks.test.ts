import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  return {
    handlers,
  };
});

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

import { registerTaskIpcHandlers } from "../../../src/main/ipc/tasks";

describe("registerTaskIpcHandlers", () => {
  beforeEach(() => {
    mocks.handlers.clear();
  });

  it("delegates task cancellation to the task manager", async () => {
    const taskManager = { cancel: vi.fn().mockResolvedValue(undefined) } as any;

    registerTaskIpcHandlers(taskManager);
    await mocks.handlers.get("tasks:cancel")?.({}, "task-1");

    expect(taskManager.cancel).toHaveBeenCalledWith("task-1");
  });
});
