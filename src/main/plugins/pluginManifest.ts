import { existsSync, readdirSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve, sep } from "path";
import {
  BITMAP_RENDERER_ICON_NAMES,
  type BitmapPluginManifest,
  type BitmapRendererFieldSchema,
  type BitmapRendererSettings,
} from "../../types";

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

const ICON_NAMES = new Set<string>(BITMAP_RENDERER_ICON_NAMES);
const NUMBER_CONTROLS = new Set(["input", "slider"]);
const SOURCE_MODES = new Set(["required", "optional", "none"]);
const SELECT_CONTROLS = new Set(["dropdown", "icon-buttons"]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value types a settings bag may hold — see `BitmapRendererSettings`. */
function isSettingValue(value: unknown): value is number | boolean | string {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "boolean" || typeof value === "string";
}

function validateOptionalString(value: unknown, where: string): string | null {
  if (value === undefined) return null;
  return isNonEmptyString(value) ? null : `${where} must be a non-empty string`;
}

/**
 * Icon names are checked here rather than left to the UI: the properties
 * panel maps a name onto a React component, and an unmapped name would render
 * `undefined` as an element type, which React treats as a fatal render error.
 */
function validateIcon(value: unknown, where: string): string | null {
  if (value === undefined) return null;
  if (!isNonEmptyString(value) || !ICON_NAMES.has(value)) {
    return `${where}.icon must be one of ${[...ICON_NAMES].join(", ")}`;
  }
  return null;
}

function validatePreset(preset: unknown, where: string): string | null {
  if (!isRecord(preset)) return `${where} is not an object`;
  if (!isNonEmptyString(preset.label)) return `${where}.label is required`;
  if (!isFiniteNumber(preset.delta)) return `${where}.delta must be a finite number`;
  return (
    validateOptionalString(preset.ariaLabel, `${where}.ariaLabel`) ?? validateIcon(preset.icon, where)
  );
}

function validateOption(option: unknown, where: string): string | null {
  if (!isRecord(option)) return `${where} is not an object`;
  if (!isNonEmptyString(option.value)) return `${where}.value is required`;
  if (!isNonEmptyString(option.label)) return `${where}.label is required`;
  return validateIcon(option.icon, where);
}

function validateNumberField(f: Record<string, unknown>, where: string): string | null {
  if (!isFiniteNumber(f.min) || !isFiniteNumber(f.max) || !isFiniteNumber(f.step)) {
    return `${where} (number) requires finite numeric min/max/step`;
  }
  if (f.min > f.max) return `${where}.min must not be greater than ${where}.max`;
  if (f.step <= 0) return `${where}.step must be greater than zero`;
  if (f.control !== undefined && !NUMBER_CONTROLS.has(f.control as string)) {
    return `${where}.control must be "input" or "slider"`;
  }
  if (f.presets !== undefined) {
    if (!Array.isArray(f.presets)) return `${where}.presets must be an array`;
    for (let i = 0; i < f.presets.length; i++) {
      const error = validatePreset(f.presets[i], `${where}.presets[${i}]`);
      if (error) return error;
    }
  }
  return null;
}

function validateSelectField(f: Record<string, unknown>, where: string): string | null {
  if (!Array.isArray(f.options) || f.options.length === 0) {
    return `${where} (select) requires a non-empty options array`;
  }
  for (let i = 0; i < f.options.length; i++) {
    const error = validateOption(f.options[i], `${where}.options[${i}]`);
    if (error) return error;
  }
  if (f.control !== undefined && !SELECT_CONTROLS.has(f.control as string)) {
    return `${where}.control must be "dropdown" or "icon-buttons"`;
  }
  return null;
}

function validateField(field: unknown, index: number): string | null {
  const where = `fields[${index}]`;
  if (!isRecord(field)) return `${where} is not an object`;
  if (!isNonEmptyString(field.key)) return `${where}.key is required`;
  if (!isNonEmptyString(field.label)) return `${where}.label is required`;

  const ariaError = validateOptionalString(field.ariaLabel, `${where}.ariaLabel`);
  if (ariaError) return ariaError;

  if (field.type === "number") return validateNumberField(field, where);
  if (field.type === "boolean") return null;
  if (field.type === "select") return validateSelectField(field, where);
  return `${where}.type must be "number", "boolean", or "select"`;
}

/**
 * Every declared field needs a default of the right type. The panel merges
 * `defaults` under the import's saved settings, so a missing or wrongly-typed
 * default silently produces a control with no sensible value rather than an
 * obvious failure — better caught here, where it can name the field.
 */
function validateDefaults(
  fields: BitmapRendererFieldSchema[],
  defaults: Record<string, unknown>,
): string | null {
  for (const [key, value] of Object.entries(defaults)) {
    if (!isSettingValue(value)) {
      return `manifest.defaults["${key}"] must be a finite number, boolean, or string`;
    }
  }

  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(defaults, field.key)) {
      return `manifest.defaults is missing a value for field "${field.key}"`;
    }
    const value = defaults[field.key];
    if (field.type === "number" && typeof value !== "number") {
      return `manifest.defaults["${field.key}"] must be a number`;
    }
    if (field.type === "boolean" && typeof value !== "boolean") {
      return `manifest.defaults["${field.key}"] must be a boolean`;
    }
    if (field.type === "select") {
      if (typeof value !== "string") return `manifest.defaults["${field.key}"] must be a string`;
      if (!field.options.some((option) => option.value === value)) {
        return `manifest.defaults["${field.key}"] must be one of that field's option values`;
      }
    }
  }
  return null;
}

function validateManifestShape(raw: unknown, folder: string): string | null {
  if (!isRecord(raw)) return "manifest.json is not an object";
  const m = raw;
  if (!isNonEmptyString(m.id)) return "manifest.id is required";
  if (!isNonEmptyString(m.label)) return "manifest.label is required";
  if (typeof m.apiVersion !== "number" || !SUPPORTED_API_VERSIONS.includes(m.apiVersion)) {
    return `manifest.apiVersion must be one of ${SUPPORTED_API_VERSIONS.join(", ")}`;
  }
  if (!isNonEmptyString(m.entry)) return "manifest.entry is required";
  if (!isRecord(m.defaults)) return "manifest.defaults is required";
  if (!Array.isArray(m.fields)) return "manifest.fields must be an array";

  const seenKeys = new Set<string>();
  for (let i = 0; i < m.fields.length; i++) {
    const fieldError = validateField(m.fields[i], i);
    if (fieldError) return fieldError;
    const key = (m.fields[i] as { key: string }).key;
    if (seenKeys.has(key)) return `fields[${i}].key "${key}" is declared more than once`;
    seenKeys.add(key);
  }

  if (m.renderTimeoutMs !== undefined && (!isFiniteNumber(m.renderTimeoutMs) || m.renderTimeoutMs <= 0)) {
    return "manifest.renderTimeoutMs must be a positive number of milliseconds";
  }

  if (m.source !== undefined && !SOURCE_MODES.has(m.source as string)) {
    return 'manifest.source must be "required", "optional", or "none"';
  }

  const defaultsError = validateDefaults(m.fields as BitmapRendererFieldSchema[], m.defaults);
  if (defaultsError) return defaultsError;

  const resolvedFolder = resolve(folder);
  const entryPath = resolve(folder, m.entry);
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
          defaults: raw.defaults as BitmapRendererSettings,
          fields: raw.fields as BitmapRendererFieldSchema[],
          renderTimeoutMs: typeof raw.renderTimeoutMs === "number" ? raw.renderTimeoutMs : undefined,
          // Defaulted here so every consumer can read it without repeating the
          // "absent means required" rule.
          source: raw.source ?? "required",
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
