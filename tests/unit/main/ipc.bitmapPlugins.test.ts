import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  return {
    handlers,
    openPath: vi.fn(),
  };
});

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      mocks.handlers.set(channel, handler);
    }),
  },
  shell: {
    openPath: mocks.openPath,
  },
}));

import { registerBitmapPluginIpcHandlers } from "../../../src/main/ipc/bitmapPlugins";
import { BitmapPluginRegistry } from "../../../src/main/plugins/pluginRegistry";

describe("registerBitmapPluginIpcHandlers", () => {
  let pluginsDir: string;
  let registry: BitmapPluginRegistry;

  beforeEach(async () => {
    pluginsDir = await mkdtemp(join(tmpdir(), "terraforge-plugins-ipc-"));
    mocks.handlers.clear();
    mocks.openPath.mockReset();
    registry = new BitmapPluginRegistry(pluginsDir);
    registerBitmapPluginIpcHandlers({ pluginsDir, registry });
  });

  afterEach(async () => {
    await rm(pluginsDir, { recursive: true, force: true });
  });

  it("registers list, rescan, and openFolder handlers", () => {
    expect(mocks.handlers.has("bitmapPlugins:list")).toBe(true);
    expect(mocks.handlers.has("bitmapPlugins:rescan")).toBe(true);
    expect(mocks.handlers.has("bitmapPlugins:openFolder")).toBe(true);
  });

  it("list returns manifests only (no entry path or folder) from an empty directory", async () => {
    const result = await mocks.handlers.get("bitmapPlugins:list")!();
    expect(result).toEqual([]);
  });

  it("rescan re-reads the plugins directory and returns manifests plus errors", async () => {
    const result = await mocks.handlers.get("bitmapPlugins:rescan")!();
    expect(result).toEqual({ manifests: [], errors: [] });
  });

  it("openFolder reveals the plugins directory via shell.openPath", async () => {
    await mocks.handlers.get("bitmapPlugins:openFolder")!();
    expect(mocks.openPath).toHaveBeenCalledWith(pluginsDir);
  });
});
