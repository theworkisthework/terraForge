import { mkdirSync, existsSync } from "fs";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { join } from "path";

/**
 * Resolves and ensures the directory users drop renderer plugin folders into.
 *
 * Named for renderers rather than bitmaps: a plugin declares in its manifest
 * whether it needs a source image, and one that needs none is a generator
 * producing geometry from its settings alone. They live together because they
 * are the same kind of thing to install, run and sandbox.
 */
export function resolveBitmapPluginsDir(userDataPath: string): string {
  const pluginsDir = join(userDataPath, "renderer-plugins");
  if (!existsSync(pluginsDir)) {
    mkdirSync(pluginsDir, { recursive: true });
  }
  return pluginsDir;
}

/**
 * Where the example plugins that ship with the app live. Placed under the
 * build output by scripts/copy-plugin-examples.mjs so this one path is
 * correct both in development and inside a packaged app.
 */
export function resolveBundledExamplesDir(mainDirname: string): string {
  return join(mainDirname, "..", "plugin-examples");
}

export interface ExampleInstallResult {
  installed: string[];
  /** Already present in the plugins folder, so left untouched. */
  skipped: string[];
  /** Examples this build has no way to run yet, so not worth installing. */
  unsupported: string[];
}

/**
 * Whether the app can currently do anything with an example.
 *
 * A plugin declaring `"source": "none"` is a generator, and there is as yet
 * no way to create a generator object — installing one would put a plugin in
 * the user's folder that appears nowhere in the app. Delete this check once
 * generators can be placed on the bed; the example is already shipped and
 * will start installing on its own.
 */
async function isUsableHere(exampleDir: string): Promise<boolean> {
  try {
    const manifest = JSON.parse(await readFile(join(exampleDir, "manifest.json"), "utf-8"));
    return manifest?.source !== "none";
  } catch {
    // A manifest we cannot read is a discovery problem, not an install one —
    // copy it in and let validation report it properly.
    return true;
  }
}

/**
 * Recursive copy built from readdir/readFile/writeFile rather than `fs.cp`.
 *
 * In a packaged app the source lives inside app.asar. Electron patches
 * readdir, readFile and stat to see into the archive, but `fs.cp` walks with
 * `opendir`, which is not patched — it fails with ENOTDIR on any asar
 * subdirectory. That only shows up in a packaged build, never in development,
 * so do not "simplify" this back to `fs.cp`.
 */
async function copyTree(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else if (entry.isFile()) await writeFile(to, await readFile(from));
  }
}

/**
 * Copies the bundled example plugins into the user's plugins folder.
 *
 * Copied rather than loaded in place on purpose: the point of an example is
 * to be opened, read and modified, so it belongs in the same folder as
 * everything else the user has installed, under their control. An existing
 * folder of the same name is never overwritten — a user who has edited an
 * example should not lose that by pressing the button again.
 */
export async function installExamplePlugins(
  examplesDir: string,
  pluginsDir: string,
): Promise<ExampleInstallResult> {
  let entries;
  try {
    entries = await readdir(examplesDir, { withFileTypes: true });
  } catch {
    throw new Error("The example plugins are missing from this build.");
  }

  const installed: string[] = [];
  const skipped: string[] = [];
  const unsupported: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const destination = join(pluginsDir, entry.name);
    if (existsSync(destination)) {
      skipped.push(entry.name);
      continue;
    }
    if (!(await isUsableHere(join(examplesDir, entry.name)))) {
      unsupported.push(entry.name);
      continue;
    }
    await copyTree(join(examplesDir, entry.name), destination);
    installed.push(entry.name);
  }

  return { installed, skipped, unsupported };
}

