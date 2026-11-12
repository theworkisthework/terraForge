/**
 * Ink service stations were once a single app-wide list, kept with the app
 * preferences in localStorage. They are machine coordinates, so they now
 * live in each machine config. This carries the old list over, once.
 *
 * The app config store sets the old list aside under its own key when it
 * first loads preferences saved by the earlier version; it stays there
 * until the machine configs holding it have been written to disk.
 */
import type { MachineConfig } from "../../../../../types";
import { parseStoredStations } from "./inkServiceStations";

export const LEGACY_INK_STATIONS_KEY = "terraforge.legacyInkServiceStations";

export function setAsideLegacyInkServiceStations(stations: unknown): void {
  try {
    localStorage.setItem(LEGACY_INK_STATIONS_KEY, JSON.stringify(stations));
  } catch {
    // Storage full or unavailable: the machines start from the default stations.
  }
}

function readLegacyStations() {
  try {
    const raw = localStorage.getItem(LEGACY_INK_STATIONS_KEY);
    return raw === null ? null : parseStoredStations(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Gives each machine config that has no stations of its own a copy of the
 * old app-wide list, and saves them. Resolves to the configs to use — the
 * ones passed in, if there was nothing to carry over.
 */
export async function adoptLegacyInkServiceStations(configs: MachineConfig[]): Promise<MachineConfig[]> {
  if (localStorage.getItem(LEGACY_INK_STATIONS_KEY) === null) return configs;
  const stations = readLegacyStations();
  if (!stations || stations.length === 0) {
    // Nothing usable was set aside.
    localStorage.removeItem(LEGACY_INK_STATIONS_KEY);
    return configs;
  }
  // No machine to give them to yet: keep them for when there is one.
  if (configs.length === 0) return configs;

  const adopted = configs.map((config) =>
    config.inkServiceStations ? config : { ...config, inkServiceStations: structuredClone(stations) },
  );
  try {
    await window.terraForge.fs.saveConfigs(adopted);
    localStorage.removeItem(LEGACY_INK_STATIONS_KEY);
  } catch {
    // Not on disk yet: the old list stays set aside, to be tried again at the next start.
  }
  return adopted;
}
