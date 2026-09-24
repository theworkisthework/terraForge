import { describe, it, expect, beforeAll } from "vitest";
import { join } from "path";
import { discoverBitmapPlugins, type BitmapPluginRecord } from "../../src/main/plugins/pluginManifest";
import { readPluginModules } from "../../src/main/plugins/pluginSource";
import { validateRendererOutput } from "../../src/renderer/src/features/bitmap-renderers/validatePath";
import { MAX_BITMAP_RENDERER_PATH_LENGTH } from "../../src/types";
import type { RendererContext, RendererOutput } from "../../src/types";

// Vitest runs from the repository root.
const examplesDir = join(process.cwd(), "examples", "plugins");

type PluginModule = { render: (context: RendererContext) => RendererOutput };

/**
 * Loads a plugin exactly as the sandbox worker does — CommonJS modules
 * evaluated from an in-memory map, with relative `require` resolved against
 * the plugin's own files and nothing else reachable. If the examples ever
 * stop working under the real contract, this fails rather than the docs
 * quietly going stale.
 */
function loadPlugin(modules: Record<string, string>, entry: string): PluginModule {
  const cache = new Map<string, { exports: PluginModule }>();
  const dirname = (path: string) => {
    const index = path.lastIndexOf("/");
    return index === -1 ? "" : path.slice(0, index);
  };
  const normalize = (path: string) => {
    const out: string[] = [];
    for (const part of path.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return out.join("/");
  };
  const resolve = (from: string, id: string) => {
    const base = normalize(`${dirname(from)}/${id}`);
    for (const candidate of [base, `${base}.js`, `${base}/index.js`, `${base}.json`]) {
      if (Object.prototype.hasOwnProperty.call(modules, candidate)) return candidate;
    }
    throw new Error(`Cannot resolve "${id}" from "${from}"`);
  };
  const load = (path: string): PluginModule => {
    const cached = cache.get(path);
    if (cached) return cached.exports;
    const module = { exports: {} as PluginModule };
    cache.set(path, module);
    const factory = new Function("module", "exports", "require", "__filename", "__dirname", modules[path]);
    factory(module, module.exports, (id: string) => load(resolve(path, id)), path, dirname(path));
    return module.exports;
  };
  return load(entry);
}

async function loadExample(record: BitmapPluginRecord): Promise<PluginModule> {
  const { modules, entry } = await readPluginModules(record);
  return loadPlugin(modules, entry);
}

const source = (width: number, height: number, tone: (x: number, y: number) => number) => {
  const values = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) values[y * width + x] = tone(x, y);
  return { width, height, values };
};

describe("example plugins", () => {
  let records: BitmapPluginRecord[];

  beforeAll(async () => {
    const result = await discoverBitmapPlugins(examplesDir);
    expect(result.errors).toEqual([]);
    records = result.plugins;
  });

  const find = (id: string) => {
    const record = records.find((entry) => entry.manifest.id === id);
    if (!record) throw new Error(`example plugin "${id}" was not discovered`);
    return record;
  };

  it("ships one example for each half of the contract", () => {
    expect(records.map((r) => r.manifest.id).sort()).toEqual([
      "example.spirograph",
      "example.tonal-lines",
    ]);
    expect(find("example.tonal-lines").manifest.source).toBe("required");
    expect(find("example.spirograph").manifest.source).toBe("none");
  });

  describe("tonal-lines (needs a source image)", () => {
    it("traces a path from the source it is given", async () => {
      const plugin = await loadExample(find("example.tonal-lines"));
      const output = plugin.render({
        width: 40,
        height: 40,
        scale: 1,
        settings: { spacingMM: 4, amplitudeMM: 1, direction: "horizontal", skipWhite: false },
        source: source(40, 40, (x) => (x < 20 ? 0 : 255)),
      });

      const layers = validateRendererOutput(output, "example.tonal-lines");
      expect(layers).toHaveLength(1);
      expect(layers[0].d).toMatch(/^M/);
    });

    it("treats its spacing setting as millimetres, via scale", async () => {
      const plugin = await loadExample(find("example.tonal-lines"));
      const settings = { spacingMM: 4, amplitudeMM: 0, direction: "horizontal", skipWhite: false };
      const dark = (x: number, y: number) => (x + y) % 255;

      // Same area in millimetres, described in two different output units:
      // one unit per mm, then two units per mm. The line count must match.
      const coarse = plugin.render({ width: 40, height: 40, scale: 1, settings, source: source(40, 40, dark) });
      const fine = plugin.render({ width: 80, height: 80, scale: 0.5, settings, source: source(80, 80, dark) });

      const moveCount = (out: RendererOutput) => (String(out).match(/M/g) ?? []).length;
      expect(moveCount(fine)).toBe(moveCount(coarse));
    });

    it("sizes its output by the drawing, not by the source resolution", async () => {
      const plugin = await loadExample(find("example.tonal-lines"));
      const settings = { spacingMM: 2, amplitudeMM: 1.2, direction: "horizontal", skipWhite: false };
      const tone = (x: number, y: number) => (x * 31 + y) % 256;

      // The same physical drawing — 200mm square — from a coarse source and a
      // source with four times the pixels. Sampling per source pixel made the
      // path grow with the picture instead, and a 12-megapixel photo blew the
      // limit outright on detail no pen could ever put on paper.
      const coarse = String(
        plugin.render({ width: 400, height: 400, scale: 0.5, settings, source: source(400, 400, tone) }),
      );
      const fine = String(
        plugin.render({ width: 1600, height: 1600, scale: 0.125, settings, source: source(1600, 1600, tone) }),
      );

      const points = (out: string) => (out.match(/[ML]/g) ?? []).length;
      expect(points(fine)).toBe(points(coarse));
      expect(() => validateRendererOutput(fine, "example.tonal-lines")).not.toThrow();
    });

    it("writes coordinates no finer than a pen can place them", async () => {
      const plugin = await loadExample(find("example.tonal-lines"));
      const settings = { spacingMM: 2, amplitudeMM: 1.2, direction: "horizontal", skipWhite: false };
      const tone = (x: number, y: number) => (x * 31 + y) % 256;

      // An output unit is a source pixel here, so a coarse scale needs fewer
      // decimals to reach the pen's 0.1mm than a fine one does.
      const decimalsOf = (out: string) => (out.match(/M([\d.]+)/)?.[1].split(".")[1] ?? "").length;

      const perPixelMM = String(
        plugin.render({ width: 200, height: 200, scale: 1, settings, source: source(200, 200, tone) }),
      );
      const fineUnits = String(
        plugin.render({ width: 800, height: 800, scale: 0.25, settings, source: source(800, 800, tone) }),
      );

      expect(decimalsOf(perPixelMM)).toBeGreaterThan(decimalsOf(fineUnits));
    });

    it("lifts the pen over white when asked", async () => {
      const plugin = await loadExample(find("example.tonal-lines"));
      const settings = { spacingMM: 4, amplitudeMM: 1, direction: "horizontal", skipWhite: true };
      const halfWhite = source(40, 40, (x) => (x < 20 ? 0 : 255));

      const output = String(plugin.render({ width: 40, height: 40, scale: 1, settings, source: halfWhite }));
      const allDark = String(
        plugin.render({ width: 40, height: 40, scale: 1, settings, source: source(40, 40, () => 0) }),
      );

      expect(output.length).toBeLessThan(allDark.length);
    });
  });

  describe("spirograph (needs no source image)", () => {
    it("generates geometry from its settings alone", async () => {
      const plugin = await loadExample(find("example.spirograph"));
      const output = plugin.render({
        width: 100,
        height: 80,
        scale: 1,
        settings: { petals: 5, ratio: 0.6, twoPens: false },
      });

      const layers = validateRendererOutput(output, "example.spirograph");
      expect(layers).toHaveLength(1);
      expect(layers[0].d).toMatch(/^M/);
    });

    it("fills the area it is asked to fill", async () => {
      const plugin = await loadExample(find("example.spirograph"));
      const settings = { petals: 5, ratio: 0.6, twoPens: false };
      const coords = (out: RendererOutput) =>
        String(out).match(/-?\d+\.\d+/g)!.map(Number);

      const small = coords(plugin.render({ width: 50, height: 50, scale: 1, settings }));
      const large = coords(plugin.render({ width: 200, height: 200, scale: 1, settings }));

      expect(Math.max(...small)).toBeLessThanOrEqual(50);
      expect(Math.max(...large)).toBeGreaterThan(100);
    });

    it("returns named, coloured layers when told to split across pens", async () => {
      const plugin = await loadExample(find("example.spirograph"));
      const output = plugin.render({
        width: 100,
        height: 100,
        scale: 1,
        settings: { petals: 5, ratio: 0.6, twoPens: true },
      });

      const layers = validateRendererOutput(output, "example.spirograph");
      expect(layers).toHaveLength(2);
      expect(layers.map((layer) => layer.label)).toEqual(["Outer sweep", "Return sweep"]);
      expect(layers.every((layer) => typeof layer.color === "string")).toBe(true);
    });

    it("resolves a sibling module through the sandbox's own require", async () => {
      const { modules, entry } = await readPluginModules(find("example.spirograph"));

      // The plugin's own files are handed over as data — its .js sources and,
      // since it is loadable too, its manifest. Nothing outside the folder.
      expect(Object.keys(modules).sort()).toEqual(["index.js", "lib/curve.js", "manifest.json"]);
      expect(entry).toBe("index.js");

      // The curve really is reached through require, not inlined.
      expect(modules["index.js"]).toContain('require("./lib/curve")');
    });
  });
});
