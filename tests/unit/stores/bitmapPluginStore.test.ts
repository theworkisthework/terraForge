import { describe, it, expect, beforeEach, vi } from "vitest";
import { useBitmapPluginStore } from "@renderer/store/bitmapPluginStore";

const api = () => (window as unknown as { terraForge: any }).terraForge.bitmapPlugins;

const manifest = { id: "acme", label: "Acme", apiVersion: 1, defaults: {}, fields: [] };
const discoveryError = { folder: "broken", message: "manifest.id is required" };

beforeEach(() => {
  useBitmapPluginStore.setState({ plugins: [], errors: [], scanning: false, actionError: null });
  vi.clearAllMocks();
});

describe("bitmapPluginStore", () => {
  it("keeps both the manifests and the discovery errors from a load", async () => {
    api().list.mockResolvedValue({ manifests: [manifest], errors: [discoveryError] });

    await useBitmapPluginStore.getState().loadBitmapPlugins();

    expect(useBitmapPluginStore.getState().plugins).toEqual([manifest]);
    expect(useBitmapPluginStore.getState().errors).toEqual([discoveryError]);
  });

  it("records an action error when the load itself fails", async () => {
    api().list.mockRejectedValue(new Error("ipc is down"));

    await useBitmapPluginStore.getState().loadBitmapPlugins();

    expect(useBitmapPluginStore.getState().plugins).toEqual([]);
    expect(useBitmapPluginStore.getState().actionError).toBe("ipc is down");
  });

  it("replaces plugins and errors on rescan and clears the scanning flag", async () => {
    useBitmapPluginStore.setState({ errors: [discoveryError] });
    api().rescan.mockResolvedValue({ manifests: [manifest], errors: [] });

    await useBitmapPluginStore.getState().rescanBitmapPlugins();

    const state = useBitmapPluginStore.getState();
    expect(state.plugins).toEqual([manifest]);
    expect(state.errors).toEqual([]);
    expect(state.scanning).toBe(false);
  });

  it("does not leave the scanning flag set when a rescan fails", async () => {
    api().rescan.mockRejectedValue(new Error("scan blew up"));

    await useBitmapPluginStore.getState().rescanBitmapPlugins();

    expect(useBitmapPluginStore.getState().scanning).toBe(false);
    expect(useBitmapPluginStore.getState().actionError).toBe("scan blew up");
  });

  it("surfaces a failure to open the plugins folder", async () => {
    api().openFolder.mockRejectedValue(new Error("Could not open the plugins folder: nope"));

    await useBitmapPluginStore.getState().openPluginsFolder();

    expect(useBitmapPluginStore.getState().actionError).toMatch(/Could not open the plugins folder/);
  });
});
