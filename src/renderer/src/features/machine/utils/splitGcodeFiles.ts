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

/**
 * Gives every file a filename of its own. Two layer groups with one name, or
 * two imports with the same name and layer, would otherwise be written to the
 * same path and the later file would replace the earlier. A repeat gets a
 * number before the extension: `pen.gcode`, `pen_2.gcode`; `pen_opt.gcode`,
 * `pen_2_opt.gcode`.
 *
 * Names are compared without regard to case, as the SD card's FAT filesystem
 * (and Windows and macOS) would. `taken` carries the names used across
 * several calls that write into one folder.
 */
export function uniqueFilenames(files: SplitFile[], taken: Set<string> = new Set()): SplitFile[] {
  return files.map((file) => {
    const [, base, ext] = /^(.*?)((?:_opt)?\.gcode)$/i.exec(file.filename) ?? [null, file.filename, ""];
    let filename = file.filename;
    for (let n = 2; taken.has(filename.toLowerCase()); n++) filename = `${base}_${n}${ext}`;
    taken.add(filename.toLowerCase());
    return filename === file.filename ? file : { ...file, filename };
  });
}

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
    filename: gcodeFilename(name.replace(/[\\/:*?"<>|]/g, "_").trim() || "group", optimise),
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

/** `color_red` or `hatch_red`, prefixed with the source image's name
 * ("photo_color_red") when the file's objects all come from one import. */
function colorFileBase(kind: "color" | "hatch", displayName: string, objects: VectorObject[]): string {
  const importNames = new Set(objects.map((o) => o.importName));
  const [only] = importNames;
  const stem = importNames.size === 1 && only ? safeFilenameBase(only.replace(/\.[^.]+$/, "")) : "";
  return `${stem ? `${stem}_` : ""}${kind}_${toFilenameSafe(displayName)}`;
}

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
    return { name: displayName, doneName: displayName, filename: gcodeFilename(colorFileBase("color", displayName, objs), optimise), objects: objs };
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
      filename: gcodeFilename(colorFileBase("hatch", displayName, objs), optimise),
      objects: objs,
    };
  });
}

/** The task store's actions that a generation needs. */
export interface GenerationTasks {
  upsertTask: (task: BackgroundTask) => void;
  registerCancelCallback: (taskId: string, cancel: () => void) => void;
  unregisterCancelCallback: (taskId: string) => void;
}

/** How one generation ended: with its G-code, by being cancelled, or by failing. */
export type GenerationResult = { gcode: string } | { gcode: null; cancelled: boolean };

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Runs one generation in a fresh worker, shown as a cancellable task.
 * Always settles, and always ends its task: a worker that fails to start,
 * throws, or is sent something it cannot receive is a failed generation,
 * not one left "Preparing…" for good.
 *
 * `target` names the file while it generates ("" for a whole job); `labels`
 * are what its task reads once it has ended.
 */
function generateInWorker({
  target,
  labels,
  objects,
  config,
  options,
  tasks,
}: {
  target: string;
  labels: { ready: string; failed: string; cancelled: string };
  objects: VectorObject[];
  config: MachineConfig;
  options: GcodeOptions;
  tasks: GenerationTasks;
}): Promise<GenerationResult> {
  const taskId = uuid();
  const task = (label: string, progress: number | null, status: BackgroundTask["status"], error?: string) =>
    tasks.upsertTask({ id: taskId, type: "gcode-generate", label, progress, status, ...(error !== undefined ? { error } : {}) });
  task(formatGcodeProgressLabel(target, "preparing"), 0, "running");

  return new Promise((resolve) => {
    let worker: Worker | null = null;
    let settled = false;
    const finish = (result: GenerationResult) => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      tasks.unregisterCancelCallback(taskId);
      resolve(result);
    };
    const fail = (error: string) => {
      if (settled) return;
      task(labels.failed, null, "error", error);
      finish({ gcode: null, cancelled: false });
    };

    try {
      worker = new Worker(new URL("../../../../../workers/svgWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e) => {
        const msg = e.data;
        if (settled) return;
        if (msg.type === "progress") task(formatGcodeProgressLabel(target, msg.stage), msg.percent, "running");
        else if (msg.type === "complete") {
          task(labels.ready, 100, "completed");
          finish({ gcode: msg.gcode as string });
        } else if (msg.type === "cancelled") {
          task(labels.cancelled, null, "cancelled");
          finish({ gcode: null, cancelled: true });
        } else if (msg.type === "error") fail(String(msg.error));
      };
      // The worker's script did not load, or threw outside its own handling.
      worker.onerror = (e) => {
        e.preventDefault?.();
        fail(e.message || "The G-code worker stopped unexpectedly");
      };
      worker.onmessageerror = () => fail("The G-code worker sent a result that could not be read");
      // Stopping the worker outright, rather than asking it to stop, also
      // ends one that is too busy to listen.
      tasks.registerCancelCallback(taskId, () => {
        if (settled) return;
        task(labels.cancelled, null, "cancelled");
        finish({ gcode: null, cancelled: true });
      });
      worker.postMessage({ type: "generate", taskId, objects, config, options });
    } catch (err) {
      fail(errorText(err));
    }
  });
}

/**
 * Generates each file in turn, then saves it into `saveDir` and/or uploads
 * it to the SD card root (when connected), as `prefs` ask. A file that
 * fails to generate, or cannot be saved, is reported and skipped; the rest
 * still run. Cancelling a file's task cancels the rest of the job with it.
 * Files that would share a filename are renamed apart first (see
 * `uniqueFilenames`).
 *
 * Resolves false if the job was cancelled, true otherwise.
 */
export async function runSplitFiles(
  files: SplitFile[],
  {
    config,
    options,
    saveDir,
    upload,
    tasks,
    usedFilenames,
    moreFollow = false,
  }: {
    config: MachineConfig;
    options: GcodeOptions;
    /** Where to save each file, or null not to. */
    saveDir: string | null;
    /** Whether to upload: checked per file, as the connection may drop. */
    upload: () => boolean;
    tasks: GenerationTasks;
    /** Filenames already written by an earlier run into the same folder. */
    usedFilenames?: Set<string>;
    /** Another run follows this one in the same job (hatch files after colour files). */
    moreFollow?: boolean;
  },
): Promise<boolean> {
  const unique = uniqueFilenames(files, usedFilenames);
  for (const [index, file] of unique.entries()) {
    const isLast = index === unique.length - 1 && !moreFollow;
    const result = await generateInWorker({
      target: file.name,
      labels: {
        ready: `${file.doneName} ready`,
        failed: `${file.doneName} failed`,
        cancelled: isLast ? `${file.doneName} cancelled` : "Export cancelled — remaining files skipped",
      },
      objects: file.objects,
      config,
      options,
      tasks,
    });
    if (result.gcode === null) {
      if (result.cancelled) return false;
      continue;
    }
    const { gcode } = result;
    if (saveDir) {
      try {
        await window.terraForge.fs.writeFile(`${saveDir}/${file.filename}`, gcode);
      } catch (err) {
        tasks.upsertTask({
          id: uuid(),
          type: "gcode-generate",
          label: `Could not save ${file.filename}`,
          progress: null,
          status: "error",
          error: errorText(err),
        });
      }
    }
    if (upload()) {
      try {
        await window.terraForge.fluidnc.uploadGcode(uuid(), gcode, "/" + file.filename);
      } catch {
        // Failed or cancelled: the upload task toast already says so
      }
    }
  }
  return true;
}

/**
 * Generates a whole job as one file, cancellable from its task. Resolves to
 * the G-code once its task reads "G-code ready", or null if it was cancelled
 * or failed (the task says which).
 */
export async function generateWholeJob({
  objects,
  config,
  options,
  tasks,
}: {
  objects: VectorObject[];
  config: MachineConfig;
  options: GcodeOptions;
  tasks: GenerationTasks;
}): Promise<string | null> {
  const result = await generateInWorker({
    target: "",
    labels: { ready: "G-code ready", failed: "G-code failed", cancelled: "G-code cancelled" },
    objects,
    config,
    options,
    tasks,
  });
  return result.gcode;
}
