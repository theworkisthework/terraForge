/**
 * Writes the drawing itself: each stroke and point tap, the `;@tf` markers
 * that record its colour, layer and dip tray, and ink service moves as
 * drawing travel accumulates.
 */
import type { MachineConfig } from "../../types";
import { fmtCoord as fmt } from "../gcodeEngine";
import { createBedMeshInterpolator } from "../../types/bedMesh";
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

const MESH_Z_ERROR_TOLERANCE_MM = 0.01;
const MAX_MESH_SUBDIVISION_DEPTH = 12;

export class JobWriter {
  private lastMarkerKey: string | null = null;
  private readonly interpolate: ((x: number, y: number) => number) | null;
  private readonly machineCoordinatePenZ: boolean;
  private readonly penUpZ: number;
  private readonly penDownZ: number;
  private currentMeshOffset = 0;
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
    this.interpolate = createBedMeshInterpolator(settings.bedMesh);
    this.machineCoordinatePenZ =
      /\bG53\b/i.test(commandCode(config.penUpCommand)) ||
      /\bG53\b/i.test(commandCode(config.penDownCommand));
    this.penUpZ = commandZ(config.penUpCommand) ?? 0;
    this.penDownZ = commandZ(config.penDownCommand) ?? 0;
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
    lines.push(`G0 X${fmt(first.x)} Y${fmt(first.y)}${this.zWord(first.x, first.y, this.penUpZ)} ; Rapid travel`);
    if (this.machineCoordinatePenZ) this.writeZAt(first, this.penUpZ);
    lines.push(`F${settings.drawSpeed}`);
    this.writePenCommand(config.penDownCommand, first, this.penDownZ, " ; Pen down");
    if (settings.penDownDelayMs > 0) lines.push(`G4 P${fmtSeconds(settings.penDownDelayMs / 1000)} ; Pen settle delay`);
    let current = first;
    for (let s = 1; s < points.length; s++) current = this.drawTo(current, points[s], dip);
    if (settings.penUpDelayMs > 0) lines.push(`G4 P${fmtSeconds(settings.penUpDelayMs / 1000)} ; Pen lift delay`);
    this.writePenCommand(config.penUpCommand, current, this.penUpZ, " ; Pen up");
    lines.push("");
  }

  writePointTap(tap: TravelPoint): void {
    this.beginItem(tap.color, tap.layer);
    const { lines, config, settings } = this;
    for (let rep = 0; rep < tap.repeats; rep++) {
      lines.push(`G0 X${fmt(tap.point.x)} Y${fmt(tap.point.y)}${this.zWord(tap.point.x, tap.point.y, this.penUpZ)} ; Point rapid`);
      if (this.machineCoordinatePenZ) this.writeZAt(tap.point, this.penUpZ);
      lines.push(`F${settings.drawSpeed}`);
      this.writePenCommand(config.penDownCommand, tap.point, this.penDownZ, " ; Point tap");
      if (settings.penDownDelayMs > 0) lines.push(`G4 P${fmtSeconds(settings.penDownDelayMs / 1000)} ; Pen settle delay`);
      if (settings.penUpDelayMs > 0) lines.push(`G4 P${fmtSeconds(settings.penUpDelayMs / 1000)} ; Pen lift delay`);
      this.writePenCommand(config.penUpCommand, tap.point, this.penUpZ, " ; Pen up");
      lines.push("");
    }
  }

  private writePenCommand(command: string, point: Point, nominalZ: number, comment: string): void {
    if (!this.interpolate) {
      this.lines.push(command + comment);
      return;
    }
    const offset = this.interpolate(point.x, point.y);
    const commandNominalZ = commandZ(command);
    if (commandNominalZ !== null) {
      this.lines.push(`${commandWithZOffset(command, offset)}${comment}`);
      this.currentMeshOffset = offset;
      return;
    }
    this.lines.push(command + comment);
    this.writeZAt(point, nominalZ);
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
    if (this.machineCoordinatePenZ) this.currentMeshOffset = 0;
    // Restart the travel count whether or not a move was made, so drawing
    // always moves on rather than retrying at the same point forever.
    this.travelSinceService = 0;
    this.nextServiceAt = chooseTriggerDistance(this.triggerBase, this.triggerJitter);
  }

  /** Draws a line to `target`, split wherever drawing travel reaches the next
   * ink service; returns where the pen ends. */
  private drawTo(from: Point, target: Point, dip: string | undefined): Point {
    if (!this.canService) {
      this.emitDrawingLine(from, target);
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
        this.emitDrawingLine(start, target);
        this.travelSinceService += remaining;
        return target;
      }

      const ratio = toTrigger / remaining;
      const split = { x: start.x + (target.x - start.x) * ratio, y: start.y + (target.y - start.y) * ratio };
      this.emitDrawingLine(start, split);
      this.travelSinceService += toTrigger;
      start = split;
      this.service(dip);
    }
  }

  private zWord(x: number, y: number, nominalZ: number): string {
    if (!this.interpolate) return "";
    if (this.machineCoordinatePenZ) return "";
    const offset = this.interpolate(x, y);
    this.currentMeshOffset = offset;
    return ` Z${fmt(nominalZ + offset)}`;
  }

  private writeZAt(point: Point, nominalZ: number, resetsZ = false): void {
    if (!this.interpolate) return;
    if (resetsZ) this.currentMeshOffset = 0;
    const offset = this.interpolate(point.x, point.y);
    if (this.machineCoordinatePenZ) {
      this.writeRelativeMeshOffset(offset);
    } else {
      this.lines.push(`G0 Z${fmt(nominalZ + offset)}`);
      this.currentMeshOffset = offset;
    }
  }

  private writeRelativeMeshOffset(offset: number): void {
    const delta = offset - this.currentMeshOffset;
    if (Math.abs(delta) > 1e-9) {
      this.lines.push(`G91 G21 G0 Z${fmt(delta)} ; Bed mesh offset`);
      this.lines.push("G90 G21");
    }
    this.currentMeshOffset = offset;
  }

  private emitDrawingLine(from: Point, target: Point): void {
    if (!this.interpolate) {
      this.lines.push(`G1 X${fmt(target.x)} Y${fmt(target.y)}`);
      return;
    }

    const boundaries = [0, ...this.meshBoundaryCrossings(from, target), 1];
    let start = from;
    let startZ = this.interpolate(from.x, from.y);
    for (let i = 1; i < boundaries.length; i++) {
      const end = pointAt(from, target, boundaries[i]);
      const endZ = this.interpolate(end.x, end.y);
      this.subdivideDrawingLine(start, startZ, end, endZ, 0);
      start = end;
      startZ = endZ;
    }
  }

  private meshBoundaryCrossings(from: Point, target: Point): number[] {
    const mesh = this.settings.bedMesh;
    if (!mesh || !this.interpolate) return [];
    const crossings: number[] = [];
    const addAxisCrossings = (
      start: number,
      end: number,
      min: number,
      span: number,
      count: number,
    ) => {
      const delta = end - start;
      if (Math.abs(delta) < 1e-9) return;
      for (let i = 0; i < count; i++) {
        const boundary = min + (span * i) / (count - 1);
        const t = (boundary - start) / delta;
        if (t > 1e-9 && t < 1 - 1e-9) crossings.push(t);
      }
    };
    addAxisCrossings(from.x, target.x, mesh.xMinMM ?? 0, mesh.widthMM, mesh.xPoints);
    addAxisCrossings(from.y, target.y, mesh.yMinMM ?? 0, mesh.heightMM, mesh.yPoints);
    return [...new Set(crossings)].sort((a, b) => a - b);
  }

  private subdivideDrawingLine(
    from: Point,
    fromZ: number,
    target: Point,
    targetZ: number,
    depth: number,
  ): void {
    const midpoint = { x: (from.x + target.x) / 2, y: (from.y + target.y) / 2 };
    const midpointZ = this.interpolate!(midpoint.x, midpoint.y);
    const linearMidpointZ = (fromZ + targetZ) / 2;
    const maxStepError = Math.max(
      Math.abs(targetZ - fromZ),
      Math.abs(midpointZ - fromZ),
      Math.abs(midpointZ - targetZ),
    );
    if (
      depth < MAX_MESH_SUBDIVISION_DEPTH &&
      (this.machineCoordinatePenZ
        ? maxStepError > MESH_Z_ERROR_TOLERANCE_MM
        : Math.abs(midpointZ - linearMidpointZ) > MESH_Z_ERROR_TOLERANCE_MM)
    ) {
      this.subdivideDrawingLine(from, fromZ, midpoint, midpointZ, depth + 1);
      this.subdivideDrawingLine(midpoint, midpointZ, target, targetZ, depth + 1);
      return;
    }
    if (this.machineCoordinatePenZ) {
      this.lines.push(`G1 X${fmt(target.x)} Y${fmt(target.y)}`);
      this.writeRelativeMeshOffset(targetZ);
    } else {
      this.lines.push(`G1 X${fmt(target.x)} Y${fmt(target.y)} Z${fmt(this.penDownZ + targetZ)}`);
      this.currentMeshOffset = targetZ;
    }
  }
}

function commandZ(command: string): number | null {
  const matches = [...commandCode(command).matchAll(/Z\s*(-?(?:\d+(?:\.\d*)?|\.\d+))/gi)];
  const value = matches.at(-1)?.[1];
  return value === undefined ? null : Number(value);
}

function commandWithZOffset(command: string, offset: number): string {
  const code = commandCode(command);
  const expression = /Z\s*(-?(?:\d+(?:\.\d*)?|\.\d+))/gi;
  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((match = expression.exec(code)) !== null) last = match;
  if (!last) return command;
  return `${code.slice(0, last.index)}Z${fmt(Number(last[1]) + offset)}${code.slice(last.index + last[0].length)}${command.slice(code.length)}`;
}

function commandCode(command: string): string {
  const commentStart = command.search(/[;(]/);
  return commentStart === -1 ? command : command.slice(0, commentStart);
}

function pointAt(from: Point, target: Point, t: number): Point {
  return {
    x: from.x + (target.x - from.x) * t,
    y: from.y + (target.y - from.y) * t,
  };
}
