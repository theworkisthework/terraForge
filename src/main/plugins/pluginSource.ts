import { readdir, readFile, stat } from "fs/promises";
import { join, relative, sep } from "path";
import type { BitmapPluginRecord } from "./pluginManifest";

/** Guard rails on how much plugin source the main process will read into memory. */
const MAX_FILES = 64;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 6;
const LOADABLE = [".js", ".json"];

export interface PluginModuleMap {
  /** Plugin-folder-relative posix paths → file contents. */
  modules: Record<string, string>;
  /** The manifest's entry, as a key into `modules`. */
  entry: string;
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

/**
 * Reads a plugin's own .js/.json files so the sandboxed worker can resolve
 * relative `require()` calls without any filesystem access of its own. The
 * main process is the only thing that ever touches disk, and it only ever
 * descends the plugin's own folder.
 */
export async function readPluginModules(record: BitmapPluginRecord): Promise<PluginModuleMap> {
  const modules: Record<string, string> = {};
  let totalBytes = 0;
  let fileCount = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        await walk(absolute, depth + 1);
        continue;
      }
      // Ignore symlinks rather than following them: resolving one could step
      // outside the plugin folder, which is exactly what the manifest's entry
      // containment check exists to prevent.
      if (!entry.isFile()) continue;
      if (!LOADABLE.some((ext) => entry.name.endsWith(ext))) continue;

      const { size } = await stat(absolute);
      if (fileCount + 1 > MAX_FILES) {
        throw new Error(`Plugin has more than ${MAX_FILES} source files.`);
      }
      if (totalBytes + size > MAX_TOTAL_BYTES) {
        throw new Error(`Plugin source exceeds ${Math.round(MAX_TOTAL_BYTES / 1024)}KB.`);
      }
      fileCount += 1;
      totalBytes += size;
      modules[toPosix(relative(record.folder, absolute))] = await readFile(absolute, "utf-8");
    }
  }

  await walk(record.folder, 0);

  const entry = toPosix(relative(record.folder, record.entryPath));
  if (!Object.prototype.hasOwnProperty.call(modules, entry)) {
    throw new Error(`Entry file "${entry}" was not found in the plugin folder.`);
  }
  return { modules, entry };
}
