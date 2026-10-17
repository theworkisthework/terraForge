import { create } from "zustand";
import type { SvgImport } from "../../../../types";
import { useBitmapPluginStore } from "../../store/bitmapPluginStore";
import { useCanvasStore } from "../../store/canvasStore";
import { bitmapRenderSignature, materializeBitmapLayers } from "./bitmapImage";

/**
 * How long a bitmap's settings must stay unchanged before a re-render starts
 * — long enough to absorb a slider drag or a burst of key repeats, short
 * enough that a single change feels immediate.
 *
 * It was 400ms, sized so a spinner clicked steadily (~250ms apart) did not
 * render on every click. That cost every change 400ms of waiting, and the
 * reason has gone: a render superseded by the next change is now aborted (its
 * worker stopped), and renderer-setting and contrast changes reuse the cached
 * source preparation, so a render the user moves past wastes little.
 */
export const RENDER_DEBOUNCE_MS = 150;

/**
 * How long the rendering state stays reported *after* the new output has
 * been applied. A small bitmap renders in a few milliseconds, so without a
 * floor the state exists for a single frame and is never really seen.
 *
 * Measured from after the paint, not from when the render started: producing
 * the geometry and painting it both block the main thread, and time spent
 * blocked is not time the user can read anything. The *result* is never
 * delayed by this; only the label lingers.
 */
export const MIN_RENDERING_VISIBLE_MS = 750;

/**
 * "pending" is the gap between a setting changing and the debounce elapsing.
 * It is distinct from both neighbours: without it the user cannot tell a
 * change was registered while the old output is still showing, and
 * "rendering" would claim work that has not started yet.
 */
export type BitmapRenderStatus = "idle" | "pending" | "rendering" | "error";

export interface BitmapRenderState {
  status: BitmapRenderStatus;
  error: string | null;
}

interface BitmapRenderStatusStore {
  /** Keyed by import id. An import with no entry is idle. */
  entries: Record<string, BitmapRenderState>;
}

// Reused across hot reloads (see the bottom of this file), so a component
// still holding the previous version of this module reads the same store the
// running service writes to.
export const useBitmapRenderStatusStore: ReturnType<typeof create<BitmapRenderStatusStore>> =
  import.meta.hot?.data?.statusStore ?? create<BitmapRenderStatusStore>(() => ({ entries: {} }));

const IDLE: BitmapRenderState = { status: "idle", error: null };

/** The render state for one import — idle unless the service says otherwise. */
export function useBitmapRenderState(importId: string): BitmapRenderState {
  return useBitmapRenderStatusStore((state) => state.entries[importId] ?? IDLE);
}

function setStatus(importId: string, status: BitmapRenderStatus, error: string | null = null): void {
  useBitmapRenderStatusStore.setState((state) => ({
    entries: { ...state.entries, [importId]: { status, error } },
  }));
}

function clearStatus(importId: string): void {
  useBitmapRenderStatusStore.setState((state) => {
    if (!(importId in state.entries)) return state;
    const entries = { ...state.entries };
    delete entries[importId];
    return { entries };
  });
}

/**
 * One import's outstanding render. Identity is the cancellation token: any
 * step that finds `jobs.get(id)` is no longer this object has been
 * superseded and must not touch the document or the status.
 */
interface RenderJob {
  /** The signature this job is producing output for. */
  signature: string;
  debounce: ReturnType<typeof setTimeout> | null;
  /** Settles once the result has been applied (or the render failed). */
  inFlight: Promise<void> | null;
  failed: boolean;
  /** Its output reached the document; it lingers only to hold the label. */
  applied: boolean;
  /** Stops the render itself — not just its result — once superseded. */
  controller: AbortController;
}

const jobs = new Map<string, RenderJob>();

/**
 * Immer hands back a new object only for an import that actually changed, so
 * memoising on identity means a store update recomputes signatures only for
 * the imports it touched.
 */
const signatureCache = new WeakMap<SvgImport, string>();

function signatureOf(imp: SvgImport): string {
  let signature = signatureCache.get(imp);
  if (signature === undefined) {
    signature = bitmapRenderSignature(imp);
    signatureCache.set(imp, signature);
  }
  return signature;
}

function isStale(imp: SvgImport): boolean {
  return imp.kind === "bitmap" && !!imp.bitmapDataUrl && imp.bitmapRenderSignature !== signatureOf(imp);
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

function cancelJob(importId: string): void {
  const job = jobs.get(importId);
  if (!job) return;
  if (job.debounce) clearTimeout(job.debounce);
  if (!job.applied) job.controller.abort();
  jobs.delete(importId);
}

function schedule(importId: string, signature: string): void {
  cancelJob(importId);
  const job: RenderJob = { signature, debounce: null, inFlight: null, failed: false, applied: false, controller: new AbortController() };
  job.debounce = setTimeout(() => void start(importId, job), RENDER_DEBOUNCE_MS);
  jobs.set(importId, job);
  setStatus(importId, "pending");
}

/** Begins a job's render now (skipping any remaining debounce) and returns its completion. */
function start(importId: string, job: RenderJob): Promise<void> {
  if (job.debounce) {
    clearTimeout(job.debounce);
    job.debounce = null;
  }
  job.inFlight ??= run(importId, job);
  return job.inFlight;
}

async function run(importId: string, job: RenderJob): Promise<void> {
  const current = () => jobs.get(importId) === job;
  setStatus(importId, "rendering");

  // Yield a turn so "rendering" is committed before decoding and tone
  // preparation — which still run on this thread — tie it up.
  await delay(0);
  if (!current()) return;

  const imp = useCanvasStore.getState().imports.find((item) => item.id === importId);
  if (!imp || signatureOf(imp) !== job.signature) return;

  let result;
  try {
    result = await materializeBitmapLayers(imp, { signal: job.controller.signal });
  } catch (err: unknown) {
    if (!current()) return;
    job.failed = true;
    setStatus(importId, "error", err instanceof Error ? err.message : String(err));
    return;
  }
  if (!current()) return;

  useCanvasStore.getState().updateImport(importId, {
    bitmapRendererPath: result.bitmapRendererPath,
    paths: result.paths,
    bitmapRenderSignature: job.signature,
    bitmapRendererVersion: result.rendererVersion,
    bitmapRenderWarnings: result.warnings?.length ? result.warnings : undefined,
  });
  job.applied = true;

  void holdRenderingLabel(importId, job);
}

async function holdRenderingLabel(importId: string, job: RenderJob): Promise<void> {
  // A zero delay cannot fire until the thread is free, so the hold starts
  // only once the new output has been committed and painted.
  await delay(0);
  await delay(MIN_RENDERING_VISIBLE_MS);
  if (jobs.get(importId) !== job) return;
  jobs.delete(importId);
  clearStatus(importId);
}

/**
 * Brings every outstanding job in line with the document: schedules a render
 * for each bitmap whose stored output predates its settings, wherever that
 * change came from, and drops jobs whose import has gone or no longer needs
 * one.
 */
function reconcile(imports: SvgImport[]): void {
  const liveIds = new Set<string>();
  for (const imp of imports) {
    if (imp.kind !== "bitmap") continue;
    liveIds.add(imp.id);
    const job = jobs.get(imp.id);
    const signature = signatureOf(imp);

    if (!isStale(imp)) {
      // Either nothing is outstanding, or this is the job that just produced
      // the current output and is holding its label. Anything else is a job
      // for settings the document has since moved away from (e.g. undo).
      if (job && job.signature !== signature) {
        cancelJob(imp.id);
        clearStatus(imp.id);
      }
      continue;
    }

    // Already pending, in flight, or failed for exactly these inputs. A job
    // that already applied its output does not count: the document has gone
    // stale again since (e.g. undo), so that output is no longer there.
    if (job?.signature === signature && !job.applied) continue;
    schedule(imp.id, signature);
  }

  for (const id of [...jobs.keys()]) {
    if (!liveIds.has(id)) {
      cancelJob(id);
      clearStatus(id);
    }
  }
}

/**
 * Renders, immediately, every visible bitmap whose stored output is stale,
 * and resolves once all of them are up to date. Call before anything consumes
 * bitmap geometry for output — otherwise a setting changed moments earlier
 * (still inside the debounce, or mid-render) would plot the previous result.
 *
 * Rejects, naming each import, if any of them cannot be brought up to date.
 * A previously failed render is retried rather than reported as-is, since the
 * cause (e.g. a plugin that had not been discovered yet) may have cleared.
 */
export async function flushBitmapRenders(): Promise<void> {
  const staleImports = () =>
    useCanvasStore.getState().imports.filter((imp) => imp.visible && isStale(imp));

  reconcile(useCanvasStore.getState().imports);
  await Promise.all(
    staleImports().map((imp) => {
      let job = jobs.get(imp.id);
      if (!job || job.failed || job.applied) {
        schedule(imp.id, signatureOf(imp));
        job = jobs.get(imp.id)!;
      }
      return start(imp.id, job);
    }),
  );

  const remaining = staleImports();
  if (remaining.length > 0) {
    const { entries } = useBitmapRenderStatusStore.getState();
    const details = remaining.map((imp) => {
      const error = entries[imp.id]?.error;
      return error ? `"${imp.name}": ${error}` : `"${imp.name}"`;
    });
    throw new Error(`Bitmap output is out of date and could not be re-rendered — ${details.join("; ")}`);
  }
}

/**
 * Re-renders one bitmap now, even though its settings have not changed — for
 * output that an older version of its renderer produced, which is never
 * replaced automatically (see `SvgImport.bitmapRendererVersion`). Status is
 * reported through the same store as any other render.
 */
export function rerenderBitmap(importId: string): Promise<void> {
  const imp = useCanvasStore.getState().imports.find((item) => item.id === importId);
  if (!imp || imp.kind !== "bitmap") return Promise.resolve();
  schedule(importId, signatureOf(imp));
  return start(importId, jobs.get(importId)!);
}

let stopService: (() => void) | null = null;

/**
 * Starts watching the document for bitmaps that need rendering. Rendering
 * lives here rather than in the properties panel so it does not depend on the
 * import being selected: a change made just before deselecting, or by undo,
 * or anywhere else, still produces up-to-date geometry. Idempotent; returns a
 * function that stops the service.
 */
export function startBitmapRenderService(): () => void {
  if (stopService) return stopService;

  reconcile(useCanvasStore.getState().imports);

  const unsubscribeCanvas = useCanvasStore.subscribe((state, previous) => {
    if (state.imports !== previous.imports) reconcile(state.imports);
  });

  // A render that failed because its plugin was missing gets another chance
  // whenever the installed set changes — the startup plugin scan routinely
  // lands after a document has already been restored.
  const unsubscribePlugins = useBitmapPluginStore.subscribe((state, previous) => {
    if (state.plugins === previous.plugins) return;
    for (const [id, job] of jobs) if (job.failed) cancelJob(id);
    reconcile(useCanvasStore.getState().imports);
  });

  stopService = () => {
    unsubscribeCanvas();
    unsubscribePlugins();
    for (const id of [...jobs.keys()]) cancelJob(id);
    useBitmapRenderStatusStore.setState({ entries: {} });
    stopService = null;
  };
  return stopService;
}

/**
 * Dev-only: survive hot reload of this module. By default Vite lets the
 * importing components accept an update to this file, which never disposes
 * this module: the previous version's service kept running and rendering
 * into its own status store while the reloaded panel read a fresh, never-
 * written one — so the status sat on "Ready" for the rest of the session.
 *
 * Accepting its own updates means this module is disposed and replaced
 * directly: the old service is stopped, the new version started in its place,
 * and the status store carried over, so components still bound to the
 * previous version read the same store the running service writes to.
 */
if (import.meta.hot) {
  const wasRunning = import.meta.hot.data?.serviceRunning === true;
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.serviceRunning = stopService !== null;
    data.statusStore = useBitmapRenderStatusStore;
    stopService?.();
  });
  if (wasRunning) startBitmapRenderService();
}
