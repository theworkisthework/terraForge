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
