/**
 * Names for per-colour G-code files and progress labels: a person picking
 * up a pen should see "cyan" or "red", not "hex-00ffff".
 */

/** Basic CSS colour keywords, for colours with no name of their own. Exact
 * matches only: a near miss named as the colour would mislead. */
const NAMED_COLORS: Record<string, string> = {
  "#000000": "black",
  "#ffffff": "white",
  "#808080": "grey",
  "#c0c0c0": "silver",
  "#ff0000": "red",
  "#800000": "maroon",
  "#ffff00": "yellow",
  "#808000": "olive",
  "#00ff00": "green",
  "#008000": "darkgreen",
  "#00ffff": "cyan",
  "#008080": "teal",
  "#0000ff": "blue",
  "#000080": "navy",
  "#ff00ff": "magenta",
  "#800080": "purple",
  "#ffa500": "orange",
  "#a52a2a": "brown",
  "#ffc0cb": "pink",
};

/** Lower-case, file-safe: spaces become underscores, anything else odd an underscore. */
export function toFilenameSafe(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/^#/, "hex-")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "uncolored"
  );
}

/**
 * A display name for each colour: the one name all its objects share (an
 * ink's), else a basic CSS colour name, else the colour itself. Where two
 * colours would share a name — two swatches both called "Blue", say — each
 * gets its colour appended, so no file overwrites another.
 */
export function colorDisplayNames(
  entries: { color: string; objects: { colorName?: string }[] }[],
): Map<string, string> {
  const named = entries.map(({ color, objects }) => {
    const names = new Set(objects.map((obj) => obj.colorName?.trim()).filter((name): name is string => !!name));
    const name = names.size === 1 ? [...names][0] : (NAMED_COLORS[color.toLowerCase()] ?? color);
    return { color, name };
  });
  const uses = new Map<string, number>();
  for (const { name } of named) uses.set(toFilenameSafe(name), (uses.get(toFilenameSafe(name)) ?? 0) + 1);
  return new Map(
    named.map(({ color, name }) => [
      color,
      (uses.get(toFilenameSafe(name)) ?? 0) > 1 && name !== color ? `${name} ${color}` : name,
    ]),
  );
}
