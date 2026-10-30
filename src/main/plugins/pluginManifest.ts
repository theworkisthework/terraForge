import { createHash } from "crypto";
import { existsSync, readdirSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve, sep } from "path";
import {
  BITMAP_RENDERER_ICON_NAMES,
  type RendererPluginManifest,
  type BitmapRendererFieldSchema,
  type BitmapRendererSettings,
} from "../../types";
import { readPluginModules, type PluginModuleMap } from "./pluginSource";

/** Bitmap-renderer plugin API versions this build knows how to load. */
const SUPPORTED_API_VERSIONS = [1];

/** A discovered, validated plugin. `entryPath`/`folder` are main-process-only —
 * never sent to the renderer (see `RendererPluginManifest`, which excludes them). */
export interface RendererPluginRecord {
  manifest: RendererPluginManifest;
  entryPath: string;
  folder: string;
  /**
   * The source read at discovery — the very modules `manifest.sourceHash` was
   * computed from, and the ones the sandbox is started with. Hashing and
   * running one snapshot means the fingerprint recorded in a drawing is always
   * the code that produced it, even if a file is edited between a rescan and
   * the next render. Absent when the source could not be read; the host then
   * tries again and reports the real error.
   */
  source?: PluginModuleMap;
}

export interface PluginDiscoveryError {
  folder: string;
  message: string;
}

export interface PluginDiscoveryResult {
  plugins: RendererPluginRecord[];
  errors: PluginDiscoveryError[];
}

const ICON_NAMES = new Set<string>(BITMAP_RENDERER_ICON_NAMES);
/** Two or more dot-separated parts, no whitespace: "acme.halftone". */
const NAMESPACED_ID = /^[^.\s]+(\.[^.\s]+)+$/;
const NUMBER_CONTROLS = new Set(["input", "slider"]);
const SOURCE_MODES = new Set(["required", "optional", "none"]);
const SELECT_CONTROLS = new Set(["dropdown", "icon-buttons"]);

/**
 * Ceilings on what a manifest may declare. Every one of these ends up in the
 * properties panel or the plugins list, so they are about keeping that UI
 * usable, not about safety — a 10,000-character label or a select with a
 * thousand options is a broken plugin, and is better reported as one here
 * than discovered as a panel that no longer lays out. Generous enough that
 * no reasonable plugin comes near them.
 */
export const MANIFEST_LIMITS = {
  id: 128,
  label: 80,
  key: 64,
  ariaLabel: 200,
  optionValue: 64,
  stringDefault: 256,
  fields: 64,
  options: 64,
  presets: 16,
  defaults: 256,
} as const;

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

/** A required string: present, non-empty, and no longer than `max`. */
function validateString(value: unknown, where: string, max: number): string | null {
  if (!isNonEmptyString(value)) return `${where} is required`;
  return value.length > max ? `${where} must be at most ${max} characters` : null;
}

function validateOptionalString(value: unknown, where: string, max: number): string | null {
  if (value === undefined) return null;
  if (!isNonEmptyString(value)) return `${where} must be a non-empty string`;
  return value.length > max ? `${where} must be at most ${max} characters` : null;
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
  const labelError = validateString(preset.label, `${where}.label`, MANIFEST_LIMITS.label);
  if (labelError) return labelError;
  if (!isFiniteNumber(preset.delta)) return `${where}.delta must be a finite number`;
  return (
    validateOptionalString(preset.ariaLabel, `${where}.ariaLabel`, MANIFEST_LIMITS.ariaLabel) ??
    validateIcon(preset.icon, where)
  );
}

function validateOption(option: unknown, where: string): string | null {
  if (!isRecord(option)) return `${where} is not an object`;
  return (
    validateString(option.value, `${where}.value`, MANIFEST_LIMITS.optionValue) ??
    validateString(option.label, `${where}.label`, MANIFEST_LIMITS.label) ??
    validateIcon(option.icon, where)
  );
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
    if (f.presets.length > MANIFEST_LIMITS.presets) {
      return `${where}.presets may have at most ${MANIFEST_LIMITS.presets} entries`;
    }
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
  if (f.options.length > MANIFEST_LIMITS.options) {
    return `${where}.options may have at most ${MANIFEST_LIMITS.options} entries`;
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
  const textError =
    validateString(field.key, `${where}.key`, MANIFEST_LIMITS.key) ??
    validateString(field.label, `${where}.label`, MANIFEST_LIMITS.label) ??
    validateOptionalString(field.ariaLabel, `${where}.ariaLabel`, MANIFEST_LIMITS.ariaLabel);
  if (textError) return textError;

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
  const entries = Object.entries(defaults);
  if (entries.length > MANIFEST_LIMITS.defaults) {
    return `manifest.defaults may have at most ${MANIFEST_LIMITS.defaults} entries`;
  }
  for (const [key, value] of entries) {
    if (key.length > MANIFEST_LIMITS.key) {
      return `manifest.defaults key "${key.slice(0, MANIFEST_LIMITS.key)}…" must be at most ${MANIFEST_LIMITS.key} characters`;
    }
    if (!isSettingValue(value)) {
      return `manifest.defaults["${key}"] must be a finite number, boolean, or string`;
    }
    if (typeof value === "string" && value.length > MANIFEST_LIMITS.stringDefault) {
      return `manifest.defaults["${key}"] must be at most ${MANIFEST_LIMITS.stringDefault} characters`;
    }
  }

  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(defaults, field.key)) {
      return `manifest.defaults is missing a value for field "${field.key}"`;
    }
    const value = defaults[field.key];
    if (field.type === "number") {
      if (typeof value !== "number") return `manifest.defaults["${field.key}"] must be a number`;
      if (value < field.min || value > field.max) {
        return `manifest.defaults["${field.key}"] must be within that field's min/max (${field.min}–${field.max})`;
      }
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
  const idError = validateString(m.id, "manifest.id", MANIFEST_LIMITS.id);
  if (idError) return idError;
  // Built-in renderers use plain ids ("spiral-amplitude"). Requiring a
  // namespace keeps every plugin out of that space — including ids a future
  // built-in might take — rather than letting a clash silently hide one.
  if (!NAMESPACED_ID.test(m.id as string)) {
    return 'manifest.id must be namespaced, like "yourname.my-renderer" — ids without a "." are reserved for built-in renderers';
  }
  const labelError = validateString(m.label, "manifest.label", MANIFEST_LIMITS.label);
  if (labelError) return labelError;
  if (typeof m.apiVersion !== "number" || !SUPPORTED_API_VERSIONS.includes(m.apiVersion)) {
    return `manifest.apiVersion must be one of ${SUPPORTED_API_VERSIONS.join(", ")}`;
  }
  if (!isNonEmptyString(m.entry)) return "manifest.entry is required";
  if (!isRecord(m.defaults)) return "manifest.defaults is required";
  if (!Array.isArray(m.fields)) return "manifest.fields must be an array";
  if (m.fields.length > MANIFEST_LIMITS.fields) {
    return `manifest.fields may have at most ${MANIFEST_LIMITS.fields} entries`;
  }

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

  if (m.inkOffset !== undefined && typeof m.inkOffset !== "boolean") {
    return "manifest.inkOffset must be true or false";
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
 * Reads everything the plugin would load — its .js/.json files, manifest
 * included — and fingerprints it, so the app can tell when a plugin's code
 * has changed since a drawing was rendered with it, without relying on
 * authors to bump a version. Reads the files; never runs them. Unreadable
 * source (missing entry, over the size limits) yields no snapshot, and the
 * render itself then reports the problem as it always has.
 */
async function snapshotPluginSource(
  record: RendererPluginRecord,
): Promise<{ source: PluginModuleMap; hash: string } | undefined> {
  try {
    const source = await readPluginModules(record);
    const hash = createHash("sha256");
    for (const path of Object.keys(source.modules).sort()) {
      hash.update(path).update("\0").update(source.modules[path]).update("\0");
    }
    return { source, hash: hash.digest("hex").slice(0, 16) };
  } catch {
    return undefined;
  }
}

/**
 * Scans `pluginsDir` for plugin subfolders, parsing and validating each
 * manifest.json without ever executing plugin code. Degrades gracefully per
 * folder — one bad manifest never breaks discovery of the rest.
 */
export async function discoverRendererPlugins(pluginsDir: string): Promise<PluginDiscoveryResult> {
  const plugins: RendererPluginRecord[] = [];
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
      const manifestText = await readFile(manifestPath, "utf-8");
      const raw = JSON.parse(manifestText);
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

      const record: RendererPluginRecord = {
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
          inkOffset: raw.inkOffset === true,
        },
        entryPath: resolve(folder, raw.entry as string),
        folder,
      };
      const snapshot = await snapshotPluginSource(record);
      // The manifest was parsed from an earlier read than the snapshot, and
      // the hash covers the snapshot's copy. If they differ, the settings
      // shown would not be the ones fingerprinted, so refuse the plugin
      // rather than record a hash that does not describe it.
      if (snapshot && snapshot.source.modules["manifest.json"] !== manifestText) {
        errors.push({ folder: folderName, message: "manifest.json changed while it was being read — rescan to load it" });
        continue;
      }
      record.manifest.sourceHash = snapshot?.hash;
      record.source = snapshot?.source;
      plugins.push(record);
    } catch (err) {
      errors.push({ folder: folderName, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { plugins, errors };
}
