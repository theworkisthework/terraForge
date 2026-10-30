/**
 * Ink and brush service moves: priming, wiping, dipping and washing at the
 * machine's service stations, written into the G-code as travel accumulates.
 */
import type { MachineConfig, InkServiceSettings, InkServiceStation } from "../../types";
import { fmtCoord as fmt } from "../gcodeEngine";
import { fmtSeconds } from "./output";

export function clampNumber(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function distanceMM(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

/**
 * Whether the mode has a station it can use: prime or wipe for prime-wipe,
 * a dip tray for brush-dip. Without one a service move does nothing, so
 * the job is generated as if the service were off — rather than retrying a
 * move that can never happen at every point of the drawing.
 */
export function canServiceInMode(settings: InkServiceSettings): boolean {
  const stations = settings.stations.filter(isEnabledStation);
  return settings.mode === "prime-wipe"
    ? stations.some((s) => s.type === "prime" || s.type === "wipe")
    : stations.some((s) => s.type === "dip");
}

export function isEnabledStation(station: InkServiceStation): boolean {
  return station.enabled !== false;
}

export function chooseTriggerDistance(baseMM: number, jitterPct: number): number {
  if (jitterPct <= 0) return baseMM;
  const ratio = jitterPct / 100;
  const scalar = 1 + (Math.random() * 2 - 1) * ratio;
  return Math.max(1, baseMM * scalar);
}

export function normalizeDipMapKey(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function colorDipMapKey(color: string | undefined): string | null {
  const normalizedColor = normalizeDipMapKey(color);
  if (!normalizedColor) return null;
  return `color:${normalizedColor}`;
}

export function resolvePreferredDipStation(
  layerDipStations: Record<string, string>,
  layer: string | undefined,
  color: string | undefined,
): string | undefined {
  if (layer) {
    const mappedByLayer = layerDipStations[layer];
    if (mappedByLayer) return mappedByLayer;
  }

  const colorKey = colorDipMapKey(color);
  if (colorKey) {
    const mappedByColor = layerDipStations[colorKey];
    if (mappedByColor) return mappedByColor;
  }

  return undefined;
}

export function emitRelativeZMove(lines: string[], deltaMM: number): void {
  lines.push("G91 ; Relative mode");
  lines.push(`G0 Z${fmt(deltaMM)}`);
  lines.push("G90 ; Absolute mode");
}

export function emitPrimePressAction(
  lines: string[],
  station: InkServiceStation,
  dwellMs: number,
): void {
  const action = station.action;
  if (!action || action.kind !== "prime-press") return;

  const zDepth = Math.max(0, action.zDepthMM);
  const pressCount = Math.max(1, Math.round(action.pressCount));

  lines.push(
    `; Prime action: ${pressCount} press${pressCount === 1 ? "" : "es"}, depth ${fmt(zDepth)} mm`,
  );
  for (let i = 0; i < pressCount; i++) {
    if (zDepth > 0) {
      emitRelativeZMove(lines, -zDepth);
      if (dwellMs > 0) {
        lines.push(`G4 P${fmtSeconds(dwellMs / 1000)} ; Prime press dwell`);
      }
      emitRelativeZMove(lines, zDepth);
    } else if (dwellMs > 0) {
      lines.push(`G4 P${fmtSeconds(dwellMs / 1000)} ; Prime press dwell`);
    }
  }
}

export function emitCircularBrushMotion(
  lines: string[],
  station: InkServiceStation,
  repetitions: number,
  radiusMM: number,
): void {
  const segments = 12;
  for (let rep = 0; rep < repetitions; rep++) {
    lines.push(`G1 X${fmt(station.x + radiusMM)} Y${fmt(station.y)}`);
    for (let i = 1; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      lines.push(
        `G1 X${fmt(station.x + radiusMM * Math.cos(theta))} Y${fmt(station.y + radiusMM * Math.sin(theta))}`,
      );
    }
    lines.push(`G1 X${fmt(station.x)} Y${fmt(station.y)}`);
  }
}

export function emitBackForthBrushMotion(
  lines: string[],
  station: InkServiceStation,
  repetitions: number,
  distanceMM: number,
): void {
  for (let rep = 0; rep < repetitions; rep++) {
    lines.push(`G1 X${fmt(station.x + distanceMM)} Y${fmt(station.y)}`);
    lines.push(`G1 X${fmt(station.x - distanceMM)} Y${fmt(station.y)}`);
    lines.push(`G1 X${fmt(station.x)} Y${fmt(station.y)}`);
  }
}

export function emitBrushMotionAction(
  lines: string[],
  config: MachineConfig,
  station: InkServiceStation,
  dwellMs: number,
): void {
  const action = station.action;
  if (!action || action.kind !== "brush-motion") return;

  const zDepth = Math.max(0, action.zDepthMM);
  const repetitions = Math.max(1, Math.round(action.repetitions));
  const distanceMM = Math.max(0, action.distanceMM);

  lines.push(
    `; Brush action: ${action.pattern}, reps ${repetitions}, distance ${fmt(distanceMM)} mm, depth ${fmt(zDepth)} mm`,
  );

  // Service brush patterns use G1 XY moves, so emit an explicit feedrate
  // before those moves to avoid firmware errors when no F word has appeared yet.
  const serviceFeed = Math.max(1, Number(config.drawSpeed) || 1000);
  lines.push(`G1 F${fmt(serviceFeed)} ; Service feedrate`);

  if (zDepth > 0) {
    emitRelativeZMove(lines, -zDepth);
  }
  if (dwellMs > 0) {
    lines.push(`G4 P${fmtSeconds(dwellMs / 1000)} ; Brush settle dwell`);
  }

  if (action.pattern === "circular") {
    emitCircularBrushMotion(lines, station, repetitions, distanceMM);
  } else {
    emitBackForthBrushMotion(lines, station, repetitions, distanceMM);
  }

  if (dwellMs > 0) {
    lines.push(`G4 P${fmtSeconds(dwellMs / 1000)} ; Brush release dwell`);
  }
  if (zDepth > 0) {
    emitRelativeZMove(lines, zDepth);
  }
}

export function emitStationContact(
  lines: string[],
  config: MachineConfig,
  station: InkServiceStation,
): void {
  const dwellMs = Number.isFinite(station.dwellMs)
    ? Math.max(0, station.dwellMs)
    : 0;

  lines.push(
    `G0 X${fmt(station.x)} Y${fmt(station.y)} ; Service move: ${station.type} (${station.name})`,
  );

  if (station.action?.kind === "prime-press") {
    emitPrimePressAction(lines, station, dwellMs);
    return;
  }
  if (station.action?.kind === "brush-motion") {
    emitBrushMotionAction(lines, config, station, dwellMs);
    return;
  }

  lines.push(config.penDownCommand + " ; Service contact");
  if (dwellMs > 0) {
    lines.push(`G4 P${fmtSeconds(dwellMs / 1000)} ; Service dwell`);
  }
  lines.push(config.penUpCommand + " ; Service pen up");
}

export function emitPrimeAndWipe(
  lines: string[],
  config: MachineConfig,
  stations: InkServiceStation[],
): boolean {
  const prime = stations.find((s) => s.type === "prime");
  const wipe = stations.find((s) => s.type === "wipe");
  if (!prime && !wipe) return false;
  lines.push("; -- Ink service: prime and wipe --");
  if (prime) emitStationContact(lines, config, prime);
  if (wipe) emitStationContact(lines, config, wipe);
  lines.push("; -- End ink service --");
  lines.push("");
  return true;
}

export function emitBrushDip(
  lines: string[],
  config: MachineConfig,
  settings: InkServiceSettings,
  stations: InkServiceStation[],
  dipCursorRef: { value: number },
  dipsSinceWashRef: { value: number },
  currentDipIdRef: { value: string | null },
  preferredDipStationId?: string,
): boolean {
  const dips = stations.filter((s) => s.type === "dip");
  if (dips.length === 0) return false;
  const wash = stations.find((s) => s.type === "wash");

  const mappedDip = preferredDipStationId
    ? dips.find((dip) => dip.id === preferredDipStationId)
    : undefined;
  const selectedDip = mappedDip
    ? mappedDip
    : settings.randomizeDipStation
      ? dips[Math.floor(Math.random() * dips.length)]
      : dips[dipCursorRef.value++ % dips.length];
  let dip = selectedDip;

  const trayChangeRequired =
    currentDipIdRef.value !== null && currentDipIdRef.value !== selectedDip.id;

  lines.push("; -- Ink service: brush dip --");

  // Never change dip trays without washing first. If no wash station exists,
  // stick to the current tray to avoid cross-contamination.
  if (trayChangeRequired) {
    if (wash) {
      lines.push(
        `; Tray change: ${currentDipIdRef.value} -> ${selectedDip.id}, wash first`,
      );
      emitStationContact(lines, config, wash);
      dipsSinceWashRef.value = 0;
    } else {
      const currentDip = dips.find((s) => s.id === currentDipIdRef.value);
      if (currentDip) {
        dip = currentDip;
        lines.push(
          `; Tray change blocked (no wash station), staying on ${currentDip.id}`,
        );
      }
    }
  }

  const washEvery = Math.max(1, settings.washEveryNDips ?? 1);
  const shouldWashBeforeDip =
    settings.includeWashMove && !!wash && dipsSinceWashRef.value >= washEvery;
  if (shouldWashBeforeDip) {
    emitStationContact(lines, config, wash); // Wash first to clean brush
    dipsSinceWashRef.value = 0;
  }

  emitStationContact(lines, config, dip); // Then dip to pick up fresh paint
  currentDipIdRef.value = dip.id;
  dipsSinceWashRef.value += 1;

  lines.push("; -- End ink service --");
  lines.push("");
  return true;
}

export function emitInkServiceMove(
  lines: string[],
  config: MachineConfig,
  settings: InkServiceSettings,
  dipCursorRef: { value: number },
  dipsSinceWashRef: { value: number },
  currentDipIdRef: { value: string | null },
  preferredDipStationId?: string,
): boolean {
  const triggerTravelMM = Number.isFinite(settings.triggerTravelMM)
    ? settings.triggerTravelMM
    : 0;
  if (triggerTravelMM <= 0) return false;

  const enabledStations = settings.stations.filter(isEnabledStation);
  if (enabledStations.length === 0) return false;

  lines.push(config.penUpCommand + " ; Pen up for service move");

  if (settings.mode === "prime-wipe") {
    return emitPrimeAndWipe(lines, config, enabledStations);
  }
  return emitBrushDip(
    lines,
    config,
    settings,
    enabledStations,
    dipCursorRef,
    dipsSinceWashRef,
    currentDipIdRef,
    preferredDipStationId,
  );
}
