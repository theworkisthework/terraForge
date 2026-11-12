/**
 * What the app config store keeps in localStorage, and how it takes over
 * the state an earlier version left there.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_INK_STATIONS_KEY } from "@renderer/features/machine/utils/legacyInkServiceStations";

const STORE_KEY = "terraforge-app-config";

/** The store as it would be after the app starts with what is in localStorage. */
async function loadStore() {
  vi.resetModules();
  const { useAppConfigStore } = await import("@renderer/store/appConfigStore");
  return useAppConfigStore;
}

const stored = () => JSON.parse(localStorage.getItem(STORE_KEY)!) as { state: Record<string, unknown>; version: number };

beforeEach(() => localStorage.clear());

describe("app config store persistence", () => {
  it("does not keep its own copy of the settings held in app-config.json", async () => {
    const store = await loadStore();
    store.getState().setDebugLoggingEnabled(true);
    store.getState().setShowConsoleTimestamps(false);
    store.getState().setVinylCuttingEnabled(true);

    expect(stored().state).toMatchObject({ vinylCuttingEnabled: true });
    expect(stored().state).not.toHaveProperty("debugLoggingEnabled");
    expect(stored().state).not.toHaveProperty("showConsoleTimestamps");

    // A restart takes them from app-config.json (see useAppBootstrap), not from here.
    const restarted = await loadStore();
    expect(restarted.getState().debugLoggingEnabled).toBe(false);
    expect(restarted.getState().showConsoleTimestamps).toBe(true);
    expect(restarted.getState().vinylCuttingEnabled).toBe(true);
  });

  describe("state saved by the version that kept ink stations app-wide", () => {
    const stations = [{ id: "tray", name: "Tray", type: "dip", x: 150, y: 20, dwellMs: 300 }];
    const legacy = (state: Record<string, unknown>) =>
      localStorage.setItem(STORE_KEY, JSON.stringify({ state, version: 0 }));

    it("sets the stations aside for the machine configs and keeps the other preferences", async () => {
      legacy({
        enablePerPathPasses: true,
        showInkServiceStationsOnCanvas: true,
        debugLoggingEnabled: true,
        showConsoleTimestamps: false,
        inkServiceStations: stations,
      });

      const store = await loadStore();

      expect(JSON.parse(localStorage.getItem(LEGACY_INK_STATIONS_KEY)!)).toEqual(stations);
      expect(store.getState()).toMatchObject({ enablePerPathPasses: true, showInkServiceStationsOnCanvas: true });
      expect(store.getState()).not.toHaveProperty("inkServiceStations");
      // The stale copies of the app-config.json settings are not used.
      expect(store.getState().debugLoggingEnabled).toBe(false);
      expect(store.getState().showConsoleTimestamps).toBe(true);

      expect(stored().version).toBe(1);
      expect(stored().state).not.toHaveProperty("inkServiceStations");
      expect(stored().state).not.toHaveProperty("debugLoggingEnabled");
    });

    it("sets nothing aside when it held no stations", async () => {
      legacy({ enablePerPathPasses: true });
      const store = await loadStore();
      expect(store.getState().enablePerPathPasses).toBe(true);
      expect(localStorage.getItem(LEGACY_INK_STATIONS_KEY)).toBeNull();
    });

    it("sets the stations aside only once", async () => {
      legacy({ inkServiceStations: stations });
      await loadStore();
      localStorage.removeItem(LEGACY_INK_STATIONS_KEY); // adopted by the machine configs

      await loadStore();
      expect(localStorage.getItem(LEGACY_INK_STATIONS_KEY)).toBeNull();
    });
  });
});
