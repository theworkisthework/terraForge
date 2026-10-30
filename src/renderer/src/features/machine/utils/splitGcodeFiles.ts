/**
 * Split G-code output: a job written as several files — one per layer
 * group, source layer, colour, or colour of hatching — each generated in
 * its own worker, then saved to a folder and/or uploaded to the SD card.
 */
import { v4 as uuid } from "uuid";
import type { GcodeOptions, MachineConfig, SvgImport, VectorObject } from "../../../../../types";
import type { BackgroundTask } from "../../../../../types";
import { normalizeSvgColor } from "../../imports/services/svgImportHelpers";
import { vectorObjectsForImportLayer } from "../../../store/canvasStore/services/vectorObjects";
import { colorDisplayNames, toFilenameSafe } from "./colorFileNames";

export type GcodeProgressStage = "preparing" | "optimizing" | "joining" | "postprocessing" | "emitting";

const STAGE_ACTIONS: Record<GcodeProgressStage, string> = {
  preparing: "Preparing",
  optimizing: "Optimizing",
  joining: "Joining",
  postprocessing: "Post-processing",
  emitting: "Emitting",
};

/** "Preparing red…" for a named file, "Preparing G-code" for a whole job. */
export function formatGcodeProgressLabel(target: string, stage?: GcodeProgressStage): string {
  const action = (stage && STAGE_ACTIONS[stage]) || "Generating";
  return target ? `${action} ${target}…` : `${action} G-code`;
}

/** One file of a split job. */
export interface SplitFile {
  /** Shown while it generates ("Preparing <name>…"). */
  name: string;
  /** Shown when it finishes or fails ("<doneName> ready"). */
  doneName: string;
  filename: string;
  objects: VectorObject[];
}

/** `base.gcode`, or `base_opt.gcode` for an optimised job. */
const gcodeFilename = (base: string, optimise: boolean) => (optimise ? `${base}_opt.gcode` : `${base}.gcode`);

/** One file per layer group, plus one for imports in no group. */
export function groupFiles(
  ungrouped: VectorObject[],
  groups: { name: string; objects: VectorObject[] }[],
  optimise: boolean,
): SplitFile[] {
  const entries = [
    ...(ungrouped.length > 0 ? [{ name: "ungrouped", objects: ungrouped }] : []),
    ...groups.filter((g) => g.objects.length > 0),
  ];
  return entries.map(({ name, objects }) => ({
    name,
    doneName: name,
    filename: gcodeFilename(name.replace(/[\\/:*?"<>|]/g, "_"), optimise),
    objects,
  }));
}

/** A filename from parts, joined by underscores, keeping only safe characters. */
function safeFilenameBase(...parts: Array<string | undefined>): string {
  const raw = parts.filter((part) => !!part && part.trim()).join("_");
  return (
    raw
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9._-]/gi, "_")
      .replace(/^_+|_+$/g, "") || "layer"
  );
}

/** One file per source SVG layer of each import, sorted by import then layer. */
export function layerFiles(imports: SvgImport[], optimise: boolean): SplitFile[] {
  return imports
    .flatMap((imp) => {
      const layerIds = new Set(imp.paths.map((path) => path.layer).filter((layer): layer is string => !!layer));
      return Array.from(layerIds).map((layerId) => ({
        importName: imp.name,
        layerName: imp.layers?.find((layer) => layer.id === layerId)?.name ?? layerId,
        objects: vectorObjectsForImportLayer(imp, layerId),
      }));
    })
    .filter((entry) => entry.objects.length > 0)
    .sort((a, b) => a.importName.localeCompare(b.importName) || a.layerName.localeCompare(b.layerName))
    .map(({ importName, layerName, objects }) => ({
      name: `${importName} / ${layerName}`,
      doneName: `${importName} / ${layerName}`,
      filename: gcodeFilename(safeFilenameBase(importName, layerName), optimise),
      objects,
    }));
}

/** Objects grouped by normalised source colour, skipping uncoloured ones. */
function byColor(objects: VectorObject[]): Map<string, VectorObject[]> {
  const groups = new Map<string, VectorObject[]>();
  for (const obj of objects) {
    const rawColor = obj.sourceColor?.trim();
    const key = rawColor ? normalizeSvgColor(rawColor) : "";
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(obj);
    groups.set(key, arr);
  }
  return groups;
}

/** Hatch lines are objects with `-h` in their id. */
const isHatch = (obj: VectorObject) => obj.id.includes("-h");

/** One file per source colour, named after it ("color_red.gcode"), sorted
 * by colour. With `withoutHatching`, hatch lines are left for hatchFiles. */
export function colorFiles(objects: VectorObject[], withoutHatching: boolean, optimise: boolean): SplitFile[] {
  const entries = Array.from(byColor(withoutHatching ? objects.filter((o) => !isHatch(o)) : objects).entries())
    .map(([color, objs]) => ({ color, objects: objs }))
    .sort((a, b) => a.color.localeCompare(b.color));
  // "cyan" or "red" where the colour has a name, rather than its hex.
  const displayNames = colorDisplayNames(entries);
  return entries.map(({ color, objects: objs }) => {
    const displayName = displayNames.get(color) ?? color;
    return { name: displayName, doneName: displayName, filename: gcodeFilename(`color_${toFilenameSafe(displayName)}`, optimise), objects: objs };
  });
}

/** One hatch-only file per fill colour ("hatch_red.gcode"), for hatching
 * with a separate pen. */
export function hatchFiles(objects: VectorObject[], optimise: boolean): SplitFile[] {
  const entries = Array.from(byColor(objects.filter(isHatch)).entries()).map(([color, objs]) => ({ color, objects: objs }));
  const displayNames = colorDisplayNames(entries);
  return entries.map(({ color, objects: objs }) => {
    const displayName = displayNames.get(color) ?? color;
    return {
      name: `hatch ${displayName}`,
      doneName: `Hatch ${displayName}`,
      filename: gcodeFilename(`hatch_${toFilenameSafe(displayName)}`, optimise),
      objects: objs,
    };
  });
}

/** Generates one file in a fresh worker, reporting progress as a task;
 * resolves to its G-code, or null if it failed. */
function generateFile(
  file: SplitFile,
  config: MachineConfig,
  options: GcodeOptions,
  upsertTask: (task: BackgroundTask) => void,
): Promise<string | null> {
  const taskId = uuid();
  const task = (label: string, progress: number | null, status: BackgroundTask["status"]) =>
    upsertTask({ id: taskId, type: "gcode-generate", label, progress, status });
  task(formatGcodeProgressLabel(file.name, "preparing"), 0, "running");

  return new Promise((resolve) => {
    const worker = new Worker(new URL("../../../../../workers/svgWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "progress") {
        task(formatGcodeProgressLabel(file.name, msg.stage), msg.percent, "running");
        return;
      }
      worker.terminate();
      if (msg.type === "complete") {
        task(`${file.doneName} ready`, 100, "completed");
        resolve(msg.gcode as string);
      } else {
        task(`${file.doneName} failed`, null, "error");
        resolve(null);
      }
    };
    worker.postMessage({ type: "generate", taskId, objects: file.objects, config, options });
  });
}

/**
 * Generates each file in turn, then saves it into `saveDir` and/or uploads
 * it to the SD card root (when connected), as `prefs` ask. A file that
 * fails is reported and skipped; the rest still run.
 */
export async function runSplitFiles(
  files: SplitFile[],
  {
    config,
    options,
    saveDir,
    upload,
    upsertTask,
  }: {
    config: MachineConfig;
    options: GcodeOptions;
    /** Where to save each file, or null not to. */
    saveDir: string | null;
    /** Whether to upload: checked per file, as the connection may drop. */
    upload: () => boolean;
    upsertTask: (task: BackgroundTask) => void;
  },
): Promise<void> {
  for (const file of files) {
    const gcode = await generateFile(file, config, options, upsertTask);
    if (!gcode) continue;
    if (saveDir) await window.terraForge.fs.writeFile(`${saveDir}/${file.filename}`, gcode);
    if (upload()) {
      try {
        await window.terraForge.fluidnc.uploadGcode(uuid(), gcode, "/" + file.filename);
      } catch {
        // Upload error surfaced via upload task toast
      }
    }
  }
}

/**
 * Generates a whole job as one file, cancellable from its task. Resolves to
 * the G-code once its task reads "G-code ready", or null if it was cancelled
 * or failed (the task says which).
 */
export function generateWholeJob({
  objects,
  config,
  options,
  upsertTask,
  registerCancelCallback,
  unregisterCancelCallback,
}: {
  objects: VectorObject[];
  config: MachineConfig;
  options: GcodeOptions;
  upsertTask: (task: BackgroundTask) => void;
  registerCancelCallback: (taskId: string, cancel: () => void) => void;
  unregisterCancelCallback: (taskId: string) => void;
}): Promise<string | null> {
  const taskId = uuid();
  const task = (label: string, progress: number | null, status: BackgroundTask["status"], error?: string) =>
    upsertTask({ id: taskId, type: "gcode-generate", label, progress, status, ...(error !== undefined ? { error } : {}) });
  const worker = new Worker(new URL("../../../../../workers/svgWorker.ts", import.meta.url), { type: "module" });
  registerCancelCallback(taskId, () => worker.postMessage({ type: "cancel", taskId }));
  task(formatGcodeProgressLabel("", "preparing"), 0, "running");

  return new Promise((resolve) => {
    const finish = (gcode: string | null) => {
      worker.terminate();
      unregisterCancelCallback(taskId);
      resolve(gcode);
    };
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "progress") task(formatGcodeProgressLabel("", msg.stage), msg.percent, "running");
      else if (msg.type === "complete") {
        task("G-code ready", 100, "completed");
        finish(msg.gcode as string);
      } else if (msg.type === "cancelled") {
        task("G-code cancelled", null, "cancelled");
        finish(null);
      } else if (msg.type === "error") {
        task("G-code failed", null, "error", msg.error);
        finish(null);
      }
    };
    worker.postMessage({ type: "generate", taskId, objects, config, options });
  });
}
