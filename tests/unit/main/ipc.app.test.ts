import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  return {
    handlers,
    getVersion: vi.fn(() => "1.2.3"),
  };
});

vi.mock("electron", () => ({
  app: {
    getVersion: mocks.getVersion,
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

import { registerAppIpcHandlers } from "../../../src/main/ipc/app";

describe("registerAppIpcHandlers", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.getVersion.mockClear();
  });

  it("answers the app's version", async () => {
    registerAppIpcHandlers();

    expect(await mocks.handlers.get("app:getVersion")?.()).toBe("1.2.3");
    expect(mocks.getVersion).toHaveBeenCalledTimes(1);
  });

  it("registers nothing else", () => {
    registerAppIpcHandlers();
    expect([...mocks.handlers.keys()]).toEqual(["app:getVersion"]);
  });
});
