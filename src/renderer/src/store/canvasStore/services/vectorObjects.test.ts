import { describe, it, expect } from "vitest";
import {
  vectorObjectsForGroup,
  vectorObjectsForImport,
  vectorObjectsForImports,
  vectorObjectsUngrouped,
} from "./vectorObjects";
import type { LayerGroup, SvgImport } from "../../../../../types";
import { flattenToSubpaths } from "../../../../../workers/gcodeEngine/stages/flatteningFlow";
import { createMachineConfig } from "../../../../../../tests/helpers/factories";

function makeImport(overrides?: Partial<SvgImport>): SvgImport {
  return {
    id: "imp-1",
    name: "imp",
    paths: [
      {
        id: "p1",
        d: "M0,0 L10,10",
        svgSource: "<path/>",
        visible: true,
      },
    ],
    x: 1,
    y: 2,
    scale: 1,
    rotation: 0,
    visible: true,
    svgWidth: 100,
    svgHeight: 100,
    viewBoxX: 0,
    viewBoxY: 0,
    ...overrides,
  };
}

describe("canvasStore vectorObjects service", () => {
  it("returns empty for hidden import", () => {
    const imp = makeImport({ visible: false });
    expect(vectorObjectsForImport(imp)).toEqual([]);
  });

  it("projects outline and hatch vectors", () => {
    const imp = makeImport({
      paths: [
        {
          id: "p1",
          d: "M0,0 L10,10",
          svgSource: "<path/>",
          visible: true,
          hatchLines: ["M0,1 L10,1", "M0,2 L10,2"],
        },
      ],
    });

    const result = vectorObjectsForImport(imp);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("p1");
    expect(result[1].id).toBe("p1-h0");
    expect(result[2].id).toBe("p1-h1");
  });

  it("filters out paths hidden by invisible layers", () => {
    const imp = makeImport({
      layers: [{ id: "l1", name: "layer", visible: false }],
      paths: [
        {
          id: "p1",
          d: "M0,0 L10,10",
          svgSource: "<path/>",
          visible: true,
          layer: "l1",
        },
      ],
    });

    expect(vectorObjectsForImport(imp)).toEqual([]);
  });

  it("vectorObjectsForImports aggregates all visible imports", () => {
    const impA = makeImport({ id: "a" });
    const impB = makeImport({ id: "b", visible: false });

    const result = vectorObjectsForImports([impA, impB]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
  });

  it("vectorObjectsForGroup returns only matching group imports", () => {
    const impA = makeImport({
      id: "a",
      paths: [{ id: "pa", d: "M0 0", svgSource: "", visible: true }],
    });
    const impB = makeImport({
      id: "b",
      paths: [{ id: "pb", d: "M0 0", svgSource: "", visible: true }],
    });
    const groups: LayerGroup[] = [
      { id: "g1", name: "one", color: "#111", importIds: ["a"] },
    ];

    const result = vectorObjectsForGroup([impA, impB], groups, "g1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pa");
  });

  it("vectorObjectsUngrouped excludes grouped imports", () => {
    const impA = makeImport({
      id: "a",
      paths: [{ id: "pa", d: "M0 0", svgSource: "", visible: true }],
    });
    const impB = makeImport({
      id: "b",
      paths: [{ id: "pb", d: "M0 0", svgSource: "", visible: true }],
    });
    const groups: LayerGroup[] = [
      { id: "g1", name: "one", color: "#111", importIds: ["a"] },
    ];

    const result = vectorObjectsUngrouped([impA, impB], groups);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pb");
  });

  it("normalizes non-zero viewBox offsets for gcode flattening", () => {
    const imp = makeImport({
      x: 0,
      y: 0,
      scale: 1,
      svgWidth: 250,
      svgHeight: 350,
      viewBoxX: 47.4,
      viewBoxY: 47.4,
      paths: [
        {
          id: "p1",
          d: "M47.4,47.4 L57.4,47.4",
          svgSource: "<path/>",
          visible: true,
        },
      ],
    });

    const vos = vectorObjectsForImport(imp);
    const cfg = createMachineConfig({
      origin: "top-left",
      bedWidth: 400,
      bedHeight: 400,
    });
    const subpaths = flattenToSubpaths(vos[0], cfg);

    expect(subpaths).toHaveLength(1);
    expect(subpaths[0][0].x).toBeCloseTo(0);
    expect(subpaths[0][0].y).toBeCloseTo(0);
    expect(subpaths[0][1].x).toBeCloseTo(10);
    expect(subpaths[0][1].y).toBeCloseTo(0);
  });
});
