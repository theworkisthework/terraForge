export const GCODE_EXTS = [
  ".gcode",
  ".nc",
  ".g",
  ".gc",
  ".gco",
  ".ngc",
  ".ncc",
  ".cnc",
  ".tap",
];

export const isGcodeFile = (name: string) =>
  GCODE_EXTS.some((ext) => name.toLowerCase().endsWith(ext));

export function parentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  parts.pop();
  return parts.length === 0 ? "/" : "/" + parts.join("/");
}

export function formatFileSize(size: number): string {
  if (size > 1_000_000) return `${(size / 1_000_000).toFixed(1)}M`;
  if (size > 1_000) return `${(size / 1_000).toFixed(0)}K`;
  return `${size}B`;
}

/** Characters an SD card's FAT filesystem will not take in a name. */
const FORBIDDEN_NAME_CHARS = /[\\/:*?"<>|]/;

/**
 * Why `name` cannot be a new folder among `existing` in the current folder,
 * or null when it can. An empty name has no message: there is nothing to say
 * until something is typed, but it still cannot be created.
 */
export function folderNameProblem(name: string, existing: readonly { name: string }[]): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return null;
  if (FORBIDDEN_NAME_CHARS.test(trimmed)) return 'A name cannot contain \\ / : * ? " < > |';
  if (trimmed === "." || trimmed === "..") return "That name is reserved";
  // FAT names are case-insensitive: "Jobs" and "jobs" are the same folder.
  const lower = trimmed.toLowerCase();
  if (existing.some((f) => f.name.toLowerCase() === lower)) return `"${trimmed}" already exists here`;
  return null;
}
