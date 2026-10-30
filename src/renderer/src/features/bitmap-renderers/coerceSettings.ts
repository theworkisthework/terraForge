import type { BitmapRendererFieldSchema, BitmapRendererSettings } from "../../../../types";
import type { BitmapRendererDefinition } from "./types";

function isSettingValue(value: unknown): value is number | boolean | string {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "boolean" || typeof value === "string";
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

function coerceField(field: BitmapRendererFieldSchema, value: unknown, fallback: unknown): number | boolean | string {
  switch (field.type) {
    case "number": {
      let next = toNumber(value);
      if (!Number.isFinite(next)) next = toNumber(fallback);
      if (!Number.isFinite(next)) next = field.min;
      return Math.min(field.max, Math.max(field.min, next));
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      return typeof fallback === "boolean" ? fallback : false;
    case "select": {
      const isOption = (candidate: unknown) => field.options.some((option) => option.value === candidate);
      if (isOption(value)) return value as string;
      return isOption(fallback) ? (fallback as string) : field.options[0].value;
    }
  }
}

/**
 * The settings a renderer actually receives: the import's saved values laid
 * over the renderer's defaults, with every declared field forced into its
 * schema — numbers finite and within `min`/`max`, booleans boolean, selects
 * one of their options — falling back to the default (or, failing that, the
 * field's own minimum / first option) for anything missing or unusable.
 *
 * Saved settings are not trustworthy input. A file from an older version may
 * lack a key or use a different one, a hand-edited file may hold anything,
 * and a plugin's ranges may have tightened since the drawing was made. Left
 * unchecked, one missing number becomes `NaN` in the renderer and `MNaN` in
 * the path, and a plugin is handed whatever the file contains. Doing this once
 * here means no renderer has to defend against it, in-tree or plugin.
 *
 * Keys with no field (a plugin may keep settings it does not expose) pass
 * through when they hold a valid settings value and are dropped otherwise.
 */
export function coerceSettings(
  fields: BitmapRendererFieldSchema[],
  defaults: BitmapRendererSettings,
  settings: Record<string, unknown> | undefined,
): BitmapRendererSettings {
  const merged: Record<string, unknown> = { ...defaults, ...settings };
  const result: BitmapRendererSettings = {};
  const fieldKeys = new Set<string>();

  for (const field of fields) {
    fieldKeys.add(field.key);
    try {
      result[field.key] = coerceField(field, merged[field.key], defaults[field.key]);
    } catch {
      // A schema malformed enough to throw (e.g. select options that are not
      // an array) should never get past manifest validation. If one does,
      // leave the field out of coercion rather than take down every caller —
      // the properties panel included — over one bad field.
      fieldKeys.delete(field.key);
    }
  }

  for (const [key, value] of Object.entries(merged)) {
    if (fieldKeys.has(key)) continue;
    if (isSettingValue(value)) result[key] = value;
    else if (isSettingValue(defaults[key])) result[key] = defaults[key];
  }

  return result;
}

/**
 * Carries values saved under a renamed key over to the new key — unless the
 * new key is already set, which is the newer value — and drops the old one.
 */
export function migrateSettings(
  settings: Record<string, unknown> | undefined,
  renamed: Record<string, string> | undefined,
): Record<string, unknown> | undefined {
  if (!settings || !renamed) return settings;
  const migrated = { ...settings };
  for (const [from, to] of Object.entries(renamed)) {
    if (!(from in migrated)) continue;
    if (!(to in migrated)) migrated[to] = migrated[from];
    delete migrated[from];
  }
  return migrated;
}

/** The settings `renderer` receives for a saved bag: migrated, then coerced. */
export function rendererSettings(
  renderer: Pick<BitmapRendererDefinition, "fields" | "defaults" | "renamedSettings">,
  saved: Record<string, unknown> | undefined,
): BitmapRendererSettings {
  return coerceSettings(renderer.fields, renderer.defaults, migrateSettings(saved, renderer.renamedSettings));
}
