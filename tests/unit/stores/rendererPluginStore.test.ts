import { describe, it, expect, beforeEach, vi } from "vitest";
import { useRendererPluginStore } from "@renderer/store/rendererPluginStore";

const api = () => (window as unknown as { terraForge: any }).terraForge.rendererPlugins;

const manifest = { id: "acme", label: "Acme", apiVersion: 1, defaults: {}, fields: [] };
const discoveryError = { folder: "broken", message: "manifest.id is required" };

beforeEach(() => {
  useRendererPluginStore.setState({ plugins: [], errors: [], scanning: false, actionError: null });
  vi.clearAllMocks();
});

describe("rendererPluginStore", () => {
  it("keeps both the manifests and the discovery errors from a load", async () => {
    api().list.mockResolvedValue({ manifests: [manifest], errors: [discoveryError] });

    await useRendererPluginStore.getState().loadRendererPlugins();

    expect(useRendererPluginStore.getState().plugins).toEqual([manifest]);
    expect(useRendererPluginStore.getState().errors).toEqual([discoveryError]);
  });

  it("records an action error when the load itself fails", async () => {
    api().list.mockRejectedValue(new Error("ipc is down"));

    await useRendererPluginStore.getState().loadRendererPlugins();

    expect(useRendererPluginStore.getState().plugins).toEqual([]);
    expect(useRendererPluginStore.getState().actionError).toBe("ipc is down");
  });

  it("replaces plugins and errors on rescan and clears the scanning flag", async () => {
    useRendererPluginStore.setState({ errors: [discoveryError] });
    api().rescan.mockResolvedValue({ manifests: [manifest], errors: [] });

    await useRendererPluginStore.getState().rescanRendererPlugins();

    const state = useRendererPluginStore.getState();
    expect(state.plugins).toEqual([manifest]);
    expect(state.errors).toEqual([]);
    expect(state.scanning).toBe(false);
  });

  it("does not leave the scanning flag set when a rescan fails", async () => {
    api().rescan.mockRejectedValue(new Error("scan blew up"));

    await useRendererPluginStore.getState().rescanRendererPlugins();

    expect(useRendererPluginStore.getState().scanning).toBe(false);
    expect(useRendererPluginStore.getState().actionError).toBe("scan blew up");
  });

  it("surfaces a failure to open the plugins folder", async () => {
    api().openFolder.mockRejectedValue(new Error("Could not open the plugins folder: nope"));

    await useRendererPluginStore.getState().openPluginsFolder();

    expect(useRendererPluginStore.getState().actionError).toMatch(/Could not open the plugins folder/);
  });
});
