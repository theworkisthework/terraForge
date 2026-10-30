import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  return {
    handlers,
    openPath: vi.fn(),
    invalidateChanged: vi.fn(),
    render: vi.fn(),
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

import { registerRendererPluginIpcHandlers } from "../../../src/main/ipc/rendererPlugins";
import { RendererPluginRegistry } from "../../../src/main/plugins/pluginRegistry";
import type { PluginHostManager } from "../../../src/main/plugins/pluginHostManager";
import type { RendererPluginRegistry as RendererPluginRegistryType } from "../../../src/main/plugins/pluginRegistry";
import { PluginSourceMissingError } from "../../../src/main/plugins/pluginSourceCache";

describe("registerRendererPluginIpcHandlers", () => {
  let pluginsDir: string;
  let examplesDir: string;
  let registry: RendererPluginRegistry;

  beforeEach(async () => {
    pluginsDir = await mkdtemp(join(tmpdir(), "terraforge-plugins-ipc-"));
    examplesDir = await mkdtemp(join(tmpdir(), "terraforge-examples-ipc-"));
    mocks.handlers.clear();
    mocks.openPath.mockReset();
    registry = new RendererPluginRegistry(pluginsDir);
    mocks.invalidateChanged.mockReset();
    mocks.render.mockReset();
    const hostManager = { invalidateChanged: mocks.invalidateChanged, render: mocks.render } as unknown as PluginHostManager;
    registerRendererPluginIpcHandlers({ pluginsDir, examplesDir, registry, hostManager });
  });

  afterEach(async () => {
    await rm(pluginsDir, { recursive: true, force: true });
    await rm(examplesDir, { recursive: true, force: true });
  });

  it("wraps a render's output, and reports a missing source as a result rather than an error", async () => {
    const render = mocks.handlers.get("rendererPlugins:render")!;
    mocks.render.mockResolvedValueOnce("M0 0");
    await expect(render({}, "acme.x", {})).resolves.toEqual({ status: "ok", output: "M0 0" });

    mocks.render.mockRejectedValueOnce(new PluginSourceMissingError("img"));
    await expect(render({}, "acme.x", {})).resolves.toEqual({ status: "source-missing" });

    mocks.render.mockRejectedValueOnce(new Error("plugin threw"));
    await expect(render({}, "acme.x", {})).rejects.toThrow("plugin threw");
  });

  it("registers list, rescan, installExamples, and openFolder handlers", () => {
    expect(mocks.handlers.has("rendererPlugins:list")).toBe(true);
    expect(mocks.handlers.has("rendererPlugins:rescan")).toBe(true);
    expect(mocks.handlers.has("rendererPlugins:installExamples")).toBe(true);
    expect(mocks.handlers.has("rendererPlugins:openFolder")).toBe(true);
  });

  it("installExamples rescans so the new plugins are usable without a further call", async () => {
    const result = await mocks.handlers.get("rendererPlugins:installExamples")!();
    expect(result).toMatchObject({ installed: [], skipped: [], manifests: [], errors: [] });
    expect(mocks.invalidateChanged).toHaveBeenCalledTimes(1);
  });

  it("list returns manifests and discovery errors from an empty directory", async () => {
    const result = await mocks.handlers.get("rendererPlugins:list")!();
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
    } as unknown as RendererPluginRegistryType;

    mocks.handlers.clear();
    registerRendererPluginIpcHandlers({
      pluginsDir,
      registry: slowRegistry,
      examplesDir,
      hostManager: { invalidateChanged: mocks.invalidateChanged } as unknown as PluginHostManager,
    });

    const pending = mocks.handlers.get("rendererPlugins:list")!();
    resolveScan?.();

    expect(await pending).toEqual({
      manifests: [{ id: "late", label: "Late", apiVersion: 1, defaults: {}, fields: [] }],
      errors: [],
    });
  });

  it("rescan re-reads the plugins directory and returns manifests plus errors", async () => {
    const result = await mocks.handlers.get("rendererPlugins:rescan")!();
    expect(result).toEqual({ manifests: [], errors: [] });
  });

  it("rescan drops warm plugin hosts so edited source is re-read", async () => {
    await mocks.handlers.get("rendererPlugins:rescan")!();
    expect(mocks.invalidateChanged).toHaveBeenCalledTimes(1);
  });

  it("openFolder reveals the plugins directory via shell.openPath", async () => {
    mocks.openPath.mockResolvedValue("");
    await mocks.handlers.get("rendererPlugins:openFolder")!();
    expect(mocks.openPath).toHaveBeenCalledWith(pluginsDir);
  });

  it("openFolder surfaces a failure — openPath resolves with an error string", async () => {
    mocks.openPath.mockResolvedValue("no such directory");
    await expect(mocks.handlers.get("rendererPlugins:openFolder")!()).rejects.toThrow(
      /Could not open the plugins folder: no such directory/,
    );
  });
});
