/**
 * Generate a unique copy name for a pasted import, following the pattern:
 * "<base> copy" -> "<base> copy (2)" -> "<base> copy (3)" etc.
 */
export function generateCopyName(
  sourceName: string,
  existingNames: string[],
): string {
  const base = sourceName.replace(/ copy \(\d+\)$/, "").replace(/ copy$/, "");
  const copyBase = `${base} copy`;
  if (!existingNames.includes(copyBase)) return copyBase;
  let n = 2;
  while (existingNames.includes(`${copyBase} (${n})`)) n++;
  return `${copyBase} (${n})`;
}
