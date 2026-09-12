import { existsSync, readdirSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve, sep } from "path";
import type { BitmapPluginManifest, BitmapRendererFieldSchema } from "../../types";

/** Bitmap-renderer plugin API versions this build knows how to load. */
const SUPPORTED_API_VERSIONS = [1];

/** A discovered, validated plugin. `entryPath`/`folder` are main-process-only —
 * never sent to the renderer (see `BitmapPluginManifest`, which excludes them). */
export interface BitmapPluginRecord {
  manifest: BitmapPluginManifest;
  entryPath: string;
  folder: string;
}

export interface PluginDiscoveryError {
  folder: string;
  message: string;
}

export interface PluginDiscoveryResult {
  plugins: BitmapPluginRecord[];
  errors: PluginDiscoveryError[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateField(field: unknown, index: number): string | null {
  if (typeof field !== "object" || field === null) return `fields[${index}] is not an object`;
  const f = field as Record<string, unknown>;
  if (!isNonEmptyString(f.key)) return `fields[${index}].key is required`;
  if (!isNonEmptyString(f.label)) return `fields[${index}].label is required`;
  if (f.type === "number") {
    if (typeof f.min !== "number" || typeof f.max !== "number" || typeof f.step !== "number") {
      return `fields[${index}] (number) requires numeric min/max/step`;
    }
  } else if (f.type === "boolean") {
    // no further fields required
  } else if (f.type === "select") {
    if (!Array.isArray(f.options) || f.options.length === 0) {
      return `fields[${index}] (select) requires a non-empty options array`;
    }
  } else {
    return `fields[${index}].type must be "number", "boolean", or "select"`;
  }
  return null;
}

function validateManifestShape(raw: unknown, folder: string): string | null {
  if (typeof raw !== "object" || raw === null) return "manifest.json is not an object";
  const m = raw as Record<string, unknown>;
  if (!isNonEmptyString(m.id)) return "manifest.id is required";
  if (!isNonEmptyString(m.label)) return "manifest.label is required";
  if (typeof m.apiVersion !== "number" || !SUPPORTED_API_VERSIONS.includes(m.apiVersion)) {
    return `manifest.apiVersion must be one of ${SUPPORTED_API_VERSIONS.join(", ")}`;
  }
  if (!isNonEmptyString(m.entry)) return "manifest.entry is required";
  if (typeof m.defaults !== "object" || m.defaults === null) return "manifest.defaults is required";
  if (!Array.isArray(m.fields)) return "manifest.fields must be an array";
  for (let i = 0; i < m.fields.length; i++) {
    const fieldError = validateField(m.fields[i], i);
    if (fieldError) return fieldError;
  }

  const resolvedFolder = resolve(folder);
  const entryPath = resolve(folder, m.entry as string);
  if (entryPath !== resolvedFolder && !entryPath.startsWith(resolvedFolder + sep)) {
    return "manifest.entry must resolve inside the plugin's own folder";
  }

  return null;
}

/**
 * Scans `pluginsDir` for plugin subfolders, parsing and validating each
 * manifest.json without ever executing plugin code. Degrades gracefully per
 * folder — one bad manifest never breaks discovery of the rest.
 */
export async function discoverBitmapPlugins(pluginsDir: string): Promise<PluginDiscoveryResult> {
  const plugins: BitmapPluginRecord[] = [];
  const errors: PluginDiscoveryError[] = [];
  const seenIds = new Set<string>();

  let folderNames: string[] = [];
  try {
    folderNames = readdirSync(pluginsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return { plugins, errors };
  }

  for (const folderName of folderNames) {
    const folder = join(pluginsDir, folderName);
    const manifestPath = join(folder, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const raw = JSON.parse(await readFile(manifestPath, "utf-8"));
      const shapeError = validateManifestShape(raw, folder);
      if (shapeError) {
        errors.push({ folder: folderName, message: shapeError });
        continue;
      }

      const id = raw.id as string;
      if (seenIds.has(id)) {
        errors.push({ folder: folderName, message: `duplicate plugin id "${id}" — first one found wins` });
        continue;
      }
      seenIds.add(id);

      plugins.push({
        manifest: {
          id,
          label: raw.label,
          apiVersion: raw.apiVersion,
          defaults: raw.defaults,
          fields: raw.fields as BitmapRendererFieldSchema[],
          renderTimeoutMs: typeof raw.renderTimeoutMs === "number" ? raw.renderTimeoutMs : undefined,
        },
        entryPath: resolve(folder, raw.entry as string),
        folder,
      });
    } catch (err) {
      errors.push({ folder: folderName, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { plugins, errors };
}
