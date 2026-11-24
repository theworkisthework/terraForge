/**
 * The optional passes between collecting geometry and writing it —
 * nearest-neighbour reordering, joining, vinyl weed border and blade
 * compensation — with progress, timing, and checks that no pass lost a path.
 */
import type { GcodeOptions } from "../../types";
import type { Subpath } from "../gcodeEngine";
import {
  joinSubpathsCooperative,
  nearestNeighbourSortCooperative,
  OperationCancelledError,
} from "../gcodeEngine/stages/pathOptimization";
import { applyVinylCompensation } from "../gcodeEngine/stages/vinylCompensation";
import { applyVinylWeedBorder } from "../gcodeEngine/stages/vinylWeedBorder";
import { remapLayerMetadata } from "./collect";
import type { GenerationSettings } from "./document";
import type { JobLog } from "./jobLog";
import type { GcodeGenerationStage, TravelSubpath } from "./output";
import {
  countReversed,
  travelDistanceMm,
  type ProcessingStats,
} from "./pathStats";

export interface ProcessContext {
  options: GcodeOptions | undefined;
  settings: GenerationSettings;
  log: JobLog;
  shouldCancel: () => boolean;
  /** Moves the job's progress to `pct` (40–95) in `stage`. */
  report: (pct: number, stage: GcodeGenerationStage, force?: boolean) => void;
}

export interface Processed {
  ordered: TravelSubpath[];
  stats: ProcessingStats;
}

const pointsOf = (list: TravelSubpath[]) => list.map((sp) => sp.points);
const pointCount = (list: Subpath[]) =>
  list.reduce((n, sp) => n + (sp?.length ?? 0), 0);

/** Thrown inside a pass to stop the job when it is cancelled. */
class Cancelled extends Error {}

/**
 * Logs an error if `after` does not hold every subpath and point of
 * `before`, and returns whether it did. Sorting must keep both; joining
 * keeps the points but may merge subpaths.
 */
export function checkConserved(
  pass: string,
  before: Subpath[],
  after: Subpath[],
  log: JobLog,
  sameCount: boolean,
): boolean {
  const missing = after.filter((sp) => !sp || sp.length === 0).length;
  const pointsBefore = pointCount(before);
  const pointsAfter = pointCount(after);
  const countOk = !sameCount || before.length === after.length;
  if (missing === 0 && countOk && pointsBefore === pointsAfter) return true;
  log.error(`${pass}: output does not match input — paths may have been lost`, {
    subpathsBefore: before.length,
    subpathsAfter: after.length,
    emptyOrMissing: missing,
    pointsBefore,
    pointsAfter,
  });
  return false;
}

/** Logs a sort that placed one input subpath twice (and so another not at all). */
export function checkSortedOnce(
  input: Subpath[],
  sorted: Subpath[],
  log: JobLog,
): void {
  const inputs = new Set(input);
  const seen = new Set<Subpath>();
  let duplicates = 0;
  for (const sp of sorted) {
    if (!inputs.has(sp)) continue; // a reversed copy
    if (seen.has(sp)) duplicates++;
    seen.add(sp);
  }
  if (duplicates > 0)
    log.error(`sort: ${duplicates} subpath(s) placed more than once`);
}

/** Labels rebuilt subpaths with their originals' layer and colour, logging
 * progress and any labels that may be wrong. Progress is reported under the
 * pass's own UI stage. */
async function relabel(
  pass: string,
  previous: TravelSubpath[],
  next: Subpath[],
  ctx: ProcessContext,
  pct: [number, number],
  uiStage: GcodeGenerationStage,
): Promise<TravelSubpath[]> {
  const stage = ctx.log.stage(`${pass}: relabel layers/colours`, next.length);
  const result = await remapLayerMetadata(previous, next, {
    isCancelled: ctx.shouldCancel,
    onProgress: (done, total) => {
      stage.tick(done);
      ctx.report(pct[0] + (done / total) * (pct[1] - pct[0]), uiStage);
    },
  });
  if (!result) throw new Cancelled();
  stage.end();
  if (result.ambiguous > 0) {
    ctx.log.warn(
      `${pass}: ${result.ambiguous} path(s) share an endpoint with paths on another layer or colour; ` +
        "their layer/colour label may be wrong",
    );
  }
  return result.subpaths;
}

async function sortPass(
  subpaths: TravelSubpath[],
  ctx: ProcessContext,
  stats: ProcessingStats,
) {
  const input = pointsOf(subpaths);
  const stage = ctx.log.stage("sort", input.length);
  const t0 = performance.now();
  const sorted = await nearestNeighbourSortCooperative(input, {
    allowReverse: ctx.settings.allowPathReversal,
    shouldCancel: ctx.shouldCancel,
    onProgress: (completed, total) => {
      stage.tick(completed);
      // Ease-out, so very large jobs show movement early.
      if (total > 0)
        ctx.report(
          40 + Math.sqrt(Math.min(1, completed / total)) * 46,
          "optimizing",
        );
    },
  });
  stats.sort = {
    ms: performance.now() - t0,
    reversed: countReversed(input, sorted),
  };
  stage.end({ reversed: stats.sort.reversed });
  checkConserved("sort", input, sorted, ctx.log, true);
  checkSortedOnce(input, sorted, ctx.log);
  return relabel("sort", subpaths, sorted, ctx, [86, 90], "optimizing");
}

async function joinPass(
  subpaths: TravelSubpath[],
  ctx: ProcessContext,
  stats: ProcessingStats,
) {
  const input = pointsOf(subpaths);
  const stage = ctx.log.stage("join", input.length);
  const t0 = performance.now();
  const joined = await joinSubpathsCooperative(
    input,
    ctx.settings.joinTolerance,
    {
      shouldCancel: ctx.shouldCancel,
      onProgress: (completed, total) => {
        stage.tick(completed);
        if (total > 0) ctx.report(90 + (completed / total) * 2, "joining");
      },
    },
  );
  stats.join = {
    ms: performance.now() - t0,
    merged: input.length - joined.length,
  };
  stage.end({ merged: stats.join.merged });
  checkConserved("join", input, joined, ctx.log, false);
  return relabel("join", subpaths, joined, ctx, [92, 93], "joining");
}

/** One vinyl pass, logging how many subpaths it changed the count by. */
async function vinylPass(
  pass: string,
  subpaths: TravelSubpath[],
  apply: (sp: Subpath[]) => Subpath[],
  ctx: ProcessContext,
  pct: number,
): Promise<{ ordered: TravelSubpath[]; ms: number }> {
  ctx.report(pct, "postprocessing", true);
  const t0 = performance.now();
  const out = apply(pointsOf(subpaths));
  const ms = performance.now() - t0;
  ctx.log.info(
    `${pass}: ${subpaths.length} -> ${out.length} subpaths in ${Math.round(ms)} ms`,
  );
  return {
    ordered: await relabel(
      pass,
      subpaths,
      out,
      ctx,
      [pct, pct],
      "postprocessing",
    ),
    ms,
  };
}

async function runPasses(
  subpaths: TravelSubpath[],
  ctx: ProcessContext,
  stats: ProcessingStats,
) {
  const { options, settings } = ctx;
  let ordered = subpaths;
  if (settings.optimise) {
    ctx.report(40, "optimizing", true);
    ordered = await sortPass(ordered, ctx, stats);
  }
  // After the sort, so subpaths it placed side by side can be merged.
  if (settings.join) {
    ctx.report(90, "joining", true);
    ordered = await joinPass(ordered, ctx, stats);
  }
  const weed = options?.vinylCutting ? options.vinylWeedBorder : undefined;
  if (weed) {
    const r = await vinylPass(
      "weed border",
      ordered,
      (sp) => applyVinylWeedBorder(sp, weed),
      ctx,
      94,
    );
    ordered = r.ordered;
    stats.weedBorder = { ms: r.ms };
  }
  const vinyl = options?.vinylCutting;
  if (vinyl) {
    const r = await vinylPass(
      "vinyl compensation",
      ordered,
      (sp) => applyVinylCompensation(sp, vinyl),
      ctx,
      95,
    );
    ordered = r.ordered;
    stats.vinyl = { ms: r.ms };
  }
  return ordered;
}

/** Runs the passes the job asks for. Returns null if cancelled. */
export async function processSubpaths(
  subpaths: TravelSubpath[],
  ctx: ProcessContext,
): Promise<Processed | null> {
  const stats: ProcessingStats = {
    subpathsIn: subpaths.length,
    subpathsOut: subpaths.length,
    travelBeforeMm: travelDistanceMm(pointsOf(subpaths)),
    travelAfterMm: 0,
  };
  let ordered: TravelSubpath[];
  try {
    ordered = await runPasses(subpaths, ctx, stats);
  } catch (err: unknown) {
    if (
      err instanceof Cancelled ||
      err instanceof OperationCancelledError ||
      ctx.shouldCancel()
    )
      return null;
    throw err;
  }
  stats.subpathsOut = ordered.length;
  stats.travelAfterMm = travelDistanceMm(pointsOf(ordered));
  return { ordered, stats };
}
