import { describe, expect, it } from "vitest";
import { createSvgImport, createSvgPath } from "../../../../../../tests/helpers/factories";
import { LAYOUT_VERSION, parseLayout } from "./parseLayout";

const layoutWith = (overrides: object = {}) => ({
  tfVersion: 1,
  savedAt: "2026-01-01T00:00:00.000Z",
  imports: [createSvgImport({ id: "a", name: "flower" })],
  ...overrides,
});
const parse = (layout: unknown) => parseLayout(JSON.stringify(layout));
/** The layout with one field of its first import replaced. */
const withImportField = (patch: object) => layoutWith({ imports: [{ ...createSvgImport({ id: "a", name: "flower" }), ...patch }] });

describe("parseLayout", () => {
  it("returns a saved layout as it was saved", () => {
    const layout = layoutWith({
      layerGroups: [{ id: "g1", name: "Pen 1", color: "#e94560", importIds: ["a"] }],
      pageTemplate: { sizeId: "a4", landscape: true, marginMM: 20, paperColor: "#ffeecc" },
    });
    expect(parse(layout)).toEqual(layout);
  });

  it("gives a layout without groups or a page an empty list and no page", () => {
    expect(parse(layoutWith())).toMatchObject({ layerGroups: [], pageTemplate: null });
  });

  it("keeps fields it does not know", () => {
    const parsed = parse(withImportField({ futureSetting: { depth: 3 } }));
    expect(parsed.imports[0]).toMatchObject({ futureSetting: { depth: 3 } });
  });

  it.each(["not-valid-json{", "[]", "null", '"text"', "42"])("rejects %s as not a layout file", (text) => {
    expect(() => parseLayout(text)).toThrow("Not a valid terraForge layout file.");
  });

  describe("version", () => {
    it("reads a file with no version as the first format", () => {
      const { tfVersion: _, ...unversioned } = layoutWith();
      expect(parse(unversioned).tfVersion).toBe(1);
    });

    it("refuses a layout from a newer version, and says to update", () => {
      expect(() => parse(layoutWith({ tfVersion: LAYOUT_VERSION + 1 }))).toThrow(
        /saved by a newer version of terraForge.*Update terraForge/,
      );
    });

    it.each(["1", 0, -1])("rejects a version of %j", (tfVersion) => {
      expect(() => parse(layoutWith({ tfVersion }))).toThrow("Not a valid terraForge layout file.");
    });
  });

  describe("imports", () => {
    it.each([null, {}, "none"])("rejects imports of %j", (imports) => {
      expect(() => parse(layoutWith({ imports }))).toThrow("valid imports array");
    });

    it("accepts an empty list", () => {
      expect(parse(layoutWith({ imports: [] })).imports).toEqual([]);
    });

    it("rejects an entry that is not an object", () => {
      expect(() => parse(layoutWith({ imports: ["flower"] }))).toThrow("Import 1 is not an import.");
    });

    it.each(["x", "y", "scale", "svgWidth", "svgHeight"])("rejects an import whose %s is text, naming the import", (key) => {
      expect(() => parse(withImportField({ [key]: "12" }))).toThrow(`Import 1 ("flower"): "${key}" should be a number.`);
    });

    it("rejects an import with a position that was NaN when saved", () => {
      // JSON.stringify writes NaN as null
      expect(() => parse(withImportField({ x: NaN }))).toThrow('"x" should be a number.');
    });

    it("rejects an import with no id, no paths, or a scale of zero", () => {
      expect(() => parse(withImportField({ id: undefined }))).toThrow('"id" should be text.');
      expect(() => parse(withImportField({ paths: undefined }))).toThrow('"paths" should be a list of paths.');
      expect(() => parse(withImportField({ scale: 0 }))).toThrow('"scale" should be a number other than zero.');
    });

    it("rejects two imports with one id", () => {
      const imp = createSvgImport({ id: "a", name: "flower" });
      expect(() => parse(layoutWith({ imports: [imp, { ...imp, name: "leaf" }] }))).toThrow(
        'Import 2 ("leaf"): another import already has the id "a".',
      );
    });

    it("fills in what has an obvious default", () => {
      const { rotation: _r, visible: _v, viewBoxX: _x, viewBoxY: _y, name: _n, ...bare } = createSvgImport({ id: "a" });
      expect(parse(layoutWith({ imports: [bare] })).imports[0]).toMatchObject({
        name: "Untitled",
        rotation: 0,
        visible: true,
        viewBoxX: 0,
        viewBoxY: 0,
      });
    });

    it("rejects an optional field of the wrong kind rather than guessing", () => {
      expect(() => parse(withImportField({ scaleX: "wide" }))).toThrow('"scaleX" should be a number.');
      expect(() => parse(withImportField({ hatchEnabled: "yes" }))).toThrow('"hatchEnabled" should be true or false.');
    });

    it("leaves an absent optional field absent, and drops one saved as null", () => {
      const parsed = parse(withImportField({ scaleX: null })).imports[0];
      expect("scaleX" in parsed).toBe(false);
      expect("strokeWidthMM" in parsed).toBe(false);
    });
  });

  describe("paths", () => {
    const withPath = (path: unknown) => withImportField({ paths: [createSvgPath(), path] });

    it("rejects a path with no outline, saying which", () => {
      expect(() => parse(withPath({ id: "p2", svgSource: "", visible: true }))).toThrow(
        'Import 1 ("flower"), path 2: "d" should be text.',
      );
    });

    it("rejects a path that is not an object", () => {
      expect(() => parse(withPath(null))).toThrow('Import 1 ("flower"), path 2 is not a path.');
    });

    it("rejects hatch lines that are not strings", () => {
      expect(() => parse(withPath({ ...createSvgPath(), hatchLines: ["M0 0", 7] }))).toThrow(
        '"hatchLines" should be a list of path strings.',
      );
    });

    it("fills in a missing source and visibility", () => {
      const parsed = parse(withPath({ id: "p2", d: "M0 0 H5" }));
      expect(parsed.imports[0].paths[1]).toEqual({ id: "p2", d: "M0 0 H5", svgSource: "", visible: true });
    });
  });

  describe("layers", () => {
    it("rejects layers that are not a list, and a layer with no id", () => {
      expect(() => parse(withImportField({ layers: {} }))).toThrow('"layers" should be a list of layers.');
      expect(() => parse(withImportField({ layers: [{ name: "ink" }] }))).toThrow(
        'Import 1 ("flower"), layer 1: "id" should be text.',
      );
    });

    it("names a layer after its id and shows it, if the file does not say", () => {
      expect(parse(withImportField({ layers: [{ id: "ink" }] })).imports[0].layers).toEqual([
        { id: "ink", name: "ink", visible: true },
      ]);
    });
  });

  describe("layer groups", () => {
    const group = (id: string, importIds: unknown) => ({ id, name: id, color: "#111111", importIds });

    it("drops ids of imports the layout does not hold", () => {
      const parsed = parse(layoutWith({ layerGroups: [group("g1", ["gone", "a", 7])] }));
      expect(parsed.layerGroups?.[0].importIds).toEqual(["a"]);
    });

    it("keeps an import in the first group that lists it only", () => {
      const parsed = parse(layoutWith({ layerGroups: [group("g1", ["a", "a"]), group("g2", ["a"])] }));
      expect(parsed.layerGroups?.map((g) => g.importIds)).toEqual([["a"], []]);
    });

    it("rejects groups that are not a list, a group with no id, a repeated id, and ids that are not a list", () => {
      expect(() => parse(layoutWith({ layerGroups: {} }))).toThrow('Layout file: "layerGroups" should be a list of groups.');
      expect(() => parse(layoutWith({ layerGroups: [{ name: "Pen", importIds: [] }] }))).toThrow(
        'Layer group 1: "id" should be text.',
      );
      expect(() => parse(layoutWith({ layerGroups: [group("g1", []), group("g1", [])] }))).toThrow(
        'Layer group 2: another group already has the id "g1".',
      );
      expect(() => parse(layoutWith({ layerGroups: [group("g1", "a")] }))).toThrow(
        'Layer group 1: "importIds" should be a list of import ids.',
      );
    });
  });

  describe("page", () => {
    it("rejects a page with no size, a text margin or a negative one", () => {
      expect(() => parse(layoutWith({ pageTemplate: { landscape: true } }))).toThrow('Page: "sizeId" should be text.');
      expect(() => parse(layoutWith({ pageTemplate: { sizeId: "a4", marginMM: "20" } }))).toThrow(
        'Page: "marginMM" should be a number.',
      );
      expect(() => parse(layoutWith({ pageTemplate: { sizeId: "a4", marginMM: -5 } }))).toThrow(
        'Page: "marginMM" should be zero or more.',
      );
      expect(() => parse(layoutWith({ pageTemplate: "a4" }))).toThrow('Layout file: "pageTemplate" should be a page.');
    });

    it("stands a page with only a size upright, with no margin", () => {
      expect(parse(layoutWith({ pageTemplate: { sizeId: "a4" } })).pageTemplate).toEqual({
        sizeId: "a4",
        landscape: false,
        marginMM: 0,
      });
    });
  });
});
