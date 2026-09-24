import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  return {
    handlers,
    openPath: vi.fn(),
    invalidateAll: vi.fn(),
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
import type { PluginHostManager } from "../../../src/main/plugins/pluginHostManager";
import type { BitmapPluginRegistry as BitmapPluginRegistryType } from "../../../src/main/plugins/pluginRegistry";

describe("registerBitmapPluginIpcHandlers", () => {
  let pluginsDir: string;
  let examplesDir: string;
  let registry: BitmapPluginRegistry;

  beforeEach(async () => {
    pluginsDir = await mkdtemp(join(tmpdir(), "terraforge-plugins-ipc-"));
    examplesDir = await mkdtemp(join(tmpdir(), "terraforge-examples-ipc-"));
    mocks.handlers.clear();
    mocks.openPath.mockReset();
    registry = new BitmapPluginRegistry(pluginsDir);
    mocks.invalidateAll.mockReset();
    const hostManager = { invalidateAll: mocks.invalidateAll } as unknown as PluginHostManager;
    registerBitmapPluginIpcHandlers({ pluginsDir, examplesDir, registry, hostManager });
  });

  afterEach(async () => {
    await rm(pluginsDir, { recursive: true, force: true });
    await rm(examplesDir, { recursive: true, force: true });
  });

  it("registers list, rescan, installExamples, and openFolder handlers", () => {
    expect(mocks.handlers.has("bitmapPlugins:list")).toBe(true);
    expect(mocks.handlers.has("bitmapPlugins:rescan")).toBe(true);
    expect(mocks.handlers.has("bitmapPlugins:installExamples")).toBe(true);
    expect(mocks.handlers.has("bitmapPlugins:openFolder")).toBe(true);
  });

  it("installExamples rescans so the new plugins are usable without a further call", async () => {
    const result = await mocks.handlers.get("bitmapPlugins:installExamples")!();
    expect(result).toMatchObject({ installed: [], skipped: [], manifests: [], errors: [] });
    expect(mocks.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it("list returns manifests and discovery errors from an empty directory", async () => {
    const result = await mocks.handlers.get("bitmapPlugins:list")!();
    expect(result).toEqual({ manifests: [], errors: [] });
  });

  it("list waits for the initial scan rather than returning an empty list early", async () => {
    let resolveScan: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { resolveScan = resolve; });
    const slowRegistry = {
      ready: () => gate,
      list: () => [{ manifest: { id: "late", label: "Late", apiVersion: 1, defaults: {}, fields: [] } }],
      lastErrors: () => [],
      rescan: vi.fn(),
      find: vi.fn(),
    } as unknown as BitmapPluginRegistryType;

    mocks.handlers.clear();
    registerBitmapPluginIpcHandlers({
      pluginsDir,
      registry: slowRegistry,
      examplesDir,
      hostManager: { invalidateAll: mocks.invalidateAll } as unknown as PluginHostManager,
    });

    const pending = mocks.handlers.get("bitmapPlugins:list")!();
    resolveScan?.();

    expect(await pending).toEqual({
      manifests: [{ id: "late", label: "Late", apiVersion: 1, defaults: {}, fields: [] }],
      errors: [],
    });
  });

  it("rescan re-reads the plugins directory and returns manifests plus errors", async () => {
    const result = await mocks.handlers.get("bitmapPlugins:rescan")!();
    expect(result).toEqual({ manifests: [], errors: [] });
  });

  it("rescan drops warm plugin hosts so edited source is re-read", async () => {
    await mocks.handlers.get("bitmapPlugins:rescan")!();
    expect(mocks.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it("openFolder reveals the plugins directory via shell.openPath", async () => {
    mocks.openPath.mockResolvedValue("");
    await mocks.handlers.get("bitmapPlugins:openFolder")!();
    expect(mocks.openPath).toHaveBeenCalledWith(pluginsDir);
  });

  it("openFolder surfaces a failure — openPath resolves with an error string", async () => {
    mocks.openPath.mockResolvedValue("no such directory");
    await expect(mocks.handlers.get("bitmapPlugins:openFolder")!()).rejects.toThrow(
      /Could not open the plugins folder: no such directory/,
    );
  });
});
