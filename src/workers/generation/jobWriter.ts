/**
 * Writes the drawing itself: each stroke and point tap, the `;@tf` markers
 * that record its colour, layer and dip tray, and ink service moves as
 * drawing travel accumulates.
 */
import type { MachineConfig } from "../../types";
import { fmtCoord as fmt } from "../gcodeEngine";
import type { GenerationSettings } from "./document";
import {
  canServiceInMode,
  chooseTriggerDistance,
  clampNumber,
  distanceMM,
  emitInkServiceMove,
  emitStationContact,
  isEnabledStation,
  resolvePreferredDipStation,
} from "./inkService";
import { emitTfMarker, fmtSeconds, metadataKey, type TravelPoint, type TravelSubpath } from "./output";

type Point = { x: number; y: number };

export class JobWriter {
  private lastMarkerKey: string | null = null;
  private readonly canService: boolean;
  private readonly triggerBase: number;
  private readonly triggerJitter: number;
  private readonly layerDipStations: Record<string, string>;
  private nextServiceAt: number;
  private travelSinceService = 0;
  private readonly dipCursor = { value: 0 };
  private readonly dipsSinceWash = { value: 0 };
  private readonly currentDip = { value: null as string | null };

  constructor(
    private readonly lines: string[],
    private readonly config: MachineConfig,
    private readonly settings: GenerationSettings,
  ) {
    const ink = settings.inkService;
    this.triggerBase = Math.max(0, ink?.triggerTravelMM ?? 0);
    this.triggerJitter = clampNumber(ink?.triggerJitterPct ?? 0, 0, 100);
    this.layerDipStations = ink?.layerDipStations ?? {};
    this.nextServiceAt = chooseTriggerDistance(this.triggerBase, this.triggerJitter);
    this.canService = !!ink && this.triggerBase > 0 && canServiceInMode(ink);
  }

  /** Prime or dip before the first stroke, so ink is loaded before drawing. */
  primeBeforeFirst(subpaths: TravelSubpath[], points: TravelPoint[]): void {
    if (!this.canService || subpaths.length + points.length === 0) return;
    const first = subpaths[0] ?? points[0];
    const dip = resolvePreferredDipStation(this.layerDipStations, first?.layer, first?.color);
    this.mark(first?.color, first?.layer, dip);
    this.service(dip);
  }

  writeSubpath({ points, color, layer }: TravelSubpath): void {
    const dip = this.beginItem(color, layer);
    const { lines, config, settings } = this;
    const first = points[0];
    lines.push(`G0 X${fmt(first.x)} Y${fmt(first.y)} ; Rapid travel`);
    lines.push(`F${settings.drawSpeed}`);
    lines.push(config.penDownCommand + " ; Pen down");
    if (settings.penDownDelayMs > 0) lines.push(`G4 P${fmtSeconds(settings.penDownDelayMs / 1000)} ; Pen settle delay`);
    let current = first;
    for (let s = 1; s < points.length; s++) current = this.drawTo(current, points[s], dip);
    if (settings.penUpDelayMs > 0) lines.push(`G4 P${fmtSeconds(settings.penUpDelayMs / 1000)} ; Pen lift delay`);
    lines.push(config.penUpCommand + " ; Pen up");
    lines.push("");
  }

  writePointTap(tap: TravelPoint): void {
    this.beginItem(tap.color, tap.layer);
    const { lines, config, settings } = this;
    for (let rep = 0; rep < tap.repeats; rep++) {
      lines.push(`G0 X${fmt(tap.point.x)} Y${fmt(tap.point.y)} ; Point rapid`);
      lines.push(`F${settings.drawSpeed}`);
      lines.push(config.penDownCommand + " ; Point tap");
      if (settings.penDownDelayMs > 0) lines.push(`G4 P${fmtSeconds(settings.penDownDelayMs / 1000)} ; Pen settle delay`);
      if (settings.penUpDelayMs > 0) lines.push(`G4 P${fmtSeconds(settings.penUpDelayMs / 1000)} ; Pen lift delay`);
      lines.push(config.penUpCommand + " ; Pen up");
      lines.push("");
    }
  }

  /** A brush-dip job ends with the brush washed, if anything was drawn. */
  writeFinalWash(operations: number): void {
    const ink = this.settings.inkService;
    const wash =
      ink?.mode === "brush-dip"
        ? ink.stations.filter(isEnabledStation).find((station) => station.type === "wash")
        : undefined;
    if (!wash || operations === 0) return;
    this.lines.push("; -- Final ink service: end wash --");
    this.lines.push(this.config.penUpCommand + " ; Pen up for final wash");
    emitStationContact(this.lines, this.config, wash);
    this.lines.push("; -- End final ink service --");
    this.lines.push("");
  }

  /** Marks a stroke or tap's colour, layer and dip tray, servicing at once
   * when it maps to a different tray than the brush holds — even if the
   * travel trigger is far off. Returns its dip tray. */
  private beginItem(color: string | undefined, layer: string | undefined): string | undefined {
    const dip = resolvePreferredDipStation(this.layerDipStations, layer, color);
    const changed = this.mark(color, layer, dip);
    if (changed && this.canService && dip && this.currentDip.value !== dip) this.service(dip);
    return dip;
  }

  /** Writes a marker when the metadata changes; returns whether it did. */
  private mark(color: string | undefined, layer: string | undefined, dip: string | undefined): boolean {
    const meta = { color, layer, dip };
    const key = metadataKey(meta);
    if (key === this.lastMarkerKey) return false;
    emitTfMarker(this.lines, meta);
    this.lastMarkerKey = key;
    return true;
  }

  private service(dip?: string): void {
    const ink = this.settings.inkService;
    if (!this.canService || !ink) return;
    emitInkServiceMove(this.lines, this.config, ink, this.dipCursor, this.dipsSinceWash, this.currentDip, dip);
    // Restart the travel count whether or not a move was made, so drawing
    // always moves on rather than retrying at the same point forever.
    this.travelSinceService = 0;
    this.nextServiceAt = chooseTriggerDistance(this.triggerBase, this.triggerJitter);
  }

  /** Draws a line to `target`, split wherever drawing travel reaches the next
   * ink service; returns where the pen ends. */
  private drawTo(from: Point, target: Point, dip: string | undefined): Point {
    if (!this.canService) {
      this.lines.push(`G1 X${fmt(target.x)} Y${fmt(target.y)}`);
      return target;
    }
    let start = from;
    for (;;) {
      const remaining = distanceMM(start, target);
      if (remaining <= 1e-9) return target;

      const toTrigger = this.nextServiceAt - this.travelSinceService;
      if (toTrigger <= 1e-9) {
        this.service(dip);
        continue;
      }
      if (remaining + 1e-9 < toTrigger) {
        this.lines.push(`G1 X${fmt(target.x)} Y${fmt(target.y)}`);
        this.travelSinceService += remaining;
        return target;
      }

      const ratio = toTrigger / remaining;
      const split = { x: start.x + (target.x - start.x) * ratio, y: start.y + (target.y - start.y) * ratio };
      this.lines.push(`G1 X${fmt(split.x)} Y${fmt(split.y)}`);
      this.travelSinceService += toTrigger;
      start = split;
      this.service(dip);
    }
  }
}
