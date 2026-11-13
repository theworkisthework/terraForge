import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  return {
    handlers,
    getVersion: vi.fn(() => "1.2.3"),
    openExternal: vi.fn(),
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
  shell: {
    openExternal: mocks.openExternal,
  },
}));

import { registerAppIpcHandlers } from "../../../src/main/ipc/app";

describe("registerAppIpcHandlers", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.getVersion.mockClear();
    mocks.openExternal.mockReset();
  });

  it("registers version and external-open handlers", async () => {
    registerAppIpcHandlers();

    expect(await mocks.handlers.get("app:getVersion")?.()).toBe("1.2.3");
    await mocks.handlers.get("app:openExternal")?.({}, "https://example.com/docs");

    expect(mocks.getVersion).toHaveBeenCalledTimes(1);
    expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/docs");
  });

  it.each(["file:///etc/passwd", "http://example.com", "javascript:alert(1)", "smb://server/share", "not a url", "", undefined])(
    "refuses to open %j",
    async (url) => {
      registerAppIpcHandlers();

      await expect(mocks.handlers.get("app:openExternal")?.({}, url)).rejects.toThrow(/only https and mailto links/);
      expect(mocks.openExternal).not.toHaveBeenCalled();
    },
  );
});
