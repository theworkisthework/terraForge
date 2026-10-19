/**
 * The parts of a G-code job around the drawing itself: the settings it is
 * generated with, the header that records them, and the job's start and end.
 */
import type { GcodeOptions, InkServiceSettings, MachineConfig } from "../../types";
import { isSolenoidPenType } from "../../types";

export interface GenerationSettings {
  optimise: boolean;
  /** Paths may be drawn end-to-start when that shortens travel. */
  allowPathReversal: boolean;
  join: boolean;
  joinTolerance: number;
  liftPenAtEnd: boolean;
  returnToHome: boolean;
  customStartGcode: string;
  customEndGcode: string;
  inkService: InkServiceSettings | undefined;
  penDownDelayMs: number;
  penUpDelayMs: number;
  /** Feedrate for drawing moves, mm/min. */
  drawSpeed: number;
}

/** A pen settle or lift delay: the job's override if set, else the
 * machine's own for pen types that need one (servo, solenoid). */
function penDelayMs(override: number | undefined, configured: number | undefined, config: MachineConfig): number {
  const raw =
    typeof override === "number"
      ? override
      : config.penType === "servo" || isSolenoidPenType(config.penType)
        ? (configured ?? 0)
        : 0;
  return Number.isFinite(raw) ? Math.max(0, raw ?? 0) : 0;
}

export function resolveGenerationSettings(config: MachineConfig, options: GcodeOptions | undefined): GenerationSettings {
  return {
    optimise: options?.optimisePaths ?? false,
    allowPathReversal: (options?.pathDirectionMode ?? "minimize-travel") === "minimize-travel",
    join: options?.joinPaths ?? false,
    joinTolerance: options?.joinTolerance ?? 0.2,
    liftPenAtEnd: options?.liftPenAtEnd ?? true,
    returnToHome: options?.returnToHome ?? false,
    customStartGcode: (options?.customStartGcode ?? "").trim(),
    customEndGcode: (options?.customEndGcode ?? "").trim(),
    inkService: options?.inkService,
    penDownDelayMs: penDelayMs(options?.penDownDelayMsOverride, config.penDownDelayMs, config),
    penUpDelayMs: penDelayMs(options?.penUpDelayMsOverride, config.penUpDelayMs, config),
    drawSpeed: typeof options?.drawSpeedOverride === "number" ? options.drawSpeedOverride : config.drawSpeed,
  };
}

const RULE = "; ---------------------------------------------------------------";

/** The comment header recording what the job was generated with, then the
 * preamble that puts the machine in a known state. */
export function emitHeader(
  lines: string[],
  config: MachineConfig,
  options: GcodeOptions | undefined,
  settings: GenerationSettings,
): void {
  const { inkService } = settings;
  lines.push("; -- terraForge G-code ------------------------------------------");
  lines.push(`; Version  : ${options?.terraForgeVersion ?? "unknown"}`);
  lines.push(`; Machine  : ${config.name}`);
  lines.push(`; Firmware : ${options?.firmwareVersion ?? "Not connected"}`);
  lines.push(`; Bed      : ${config.bedWidth} x ${config.bedHeight} mm`);
  lines.push(`; Origin   : ${config.origin}`);
  if (options?.pageClip) {
    const pc = options.pageClip;
    lines.push(`; Page clip: ${pc.widthMM} x ${pc.heightMM} mm (${pc.marginMM} mm margin)`);
  }
  lines.push(`; Optimised: ${settings.optimise ? "yes (nearest-neighbour)" : "no"}`);
  lines.push(
    `; Path dir : ${settings.allowPathReversal ? "minimize travel (reversal enabled)" : "respect source direction"}`,
  );
  lines.push(`; Joined   : ${settings.join ? `yes (tolerance ${settings.joinTolerance} mm)` : "no"}`);
  lines.push(`; Lift end : ${settings.liftPenAtEnd ? "yes" : "no"}`);
  lines.push(`; Ret home : ${settings.returnToHome ? "yes" : "no"}`);
  lines.push(`; Pen delay: ${settings.penDownDelayMs} ms`);
  lines.push(`; Pen up delay: ${settings.penUpDelayMs} ms`);
  const vinyl = options?.vinylCutting;
  lines.push(
    vinyl
      ? `; Vinyl    : yes (offset ${vinyl.bladeOffsetMM} mm, threshold ${vinyl.cornerAngleThresholdDeg} deg, blade rotation offset ${vinyl.microJogMagnitudeMM} mm)`
      : "; Vinyl    : no",
  );
  lines.push(
    options?.vinylWeedBorder ? `; Weed bd  : yes (margin ${options.vinylWeedBorder.marginMM} mm)` : "; Weed bd  : no",
  );
  lines.push(
    inkService
      ? `; Dip svc  : ${inkService.mode}, every ${inkService.triggerTravelMM} mm (jitter +/-${inkService.triggerJitterPct ?? 0}%)`
      : "; Dip svc  : no",
  );
  lines.push(`; Generated: ${new Date().toISOString()}`);
  lines.push(RULE);
  lines.push("G90      ; Absolute coordinates");
  lines.push("G21      ; Units: mm");
  lines.push(config.penUpCommand + " ; Pen up");
  lines.push("");

  if (settings.customStartGcode) {
    lines.push("; -- Custom start G-code ----------------------------------------");
    lines.push(settings.customStartGcode);
    lines.push(RULE);
    lines.push("");
  }
}

/** The end of the job: lift the pen, return home and custom end G-code, as set. */
export function emitFooter(lines: string[], config: MachineConfig, settings: GenerationSettings): void {
  lines.push("; -- End of job -----------------------------------------------");
  if (settings.liftPenAtEnd) lines.push(config.penUpCommand + " ; Pen up - safe");
  if (settings.returnToHome) lines.push("G0 X0 Y0 ; Return to origin");
  if (settings.customEndGcode) {
    lines.push("; -- Custom end G-code ------------------------------------------");
    lines.push(settings.customEndGcode);
    lines.push(RULE);
  }
}
