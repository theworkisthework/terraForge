import { describe, it, expect } from "vitest";
import { computeColorGroups } from "../../src/renderer/src/features/properties-panel/hooks/useColorGroupsModel";
import { createSvgPath } from "../helpers/factories";

describe("computeColorGroups", () => {
  it("returns empty array when no paths have fill or stroke colors", () => {
    const paths = [
      createSvgPath({ hasFill: false, fillColor: undefined }),
      createSvgPath({ hasFill: false, fillColor: undefined }),
    ];
    const groups = computeColorGroups(paths);
    expect(groups).toHaveLength(0);
  });

  it("groups paths by normalized fill color", () => {
    const paths = [
      createSvgPath({ id: "p1", hasFill: true, fillColor: "black" }),
      createSvgPath({ id: "p2", hasFill: true, fillColor: "#FF0000" }),
      createSvgPath({ id: "p3", hasFill: true, fillColor: "black" }),
    ];
    const groups = computeColorGroups(paths);
    expect(groups).toHaveLength(2);

    const blackGroup = groups.find((g) => g.color === "#000000");
    expect(blackGroup?.count).toBe(2);
    expect(blackGroup?.paths.map((p) => p.pathId)).toContain("p1");
    expect(blackGroup?.paths.map((p) => p.pathId)).toContain("p3");

    const redGroup = groups.find((g) => g.color === "#ff0000");
    expect(redGroup?.count).toBe(1);
    expect(redGroup?.paths.map((p) => p.pathId)).toContain("p2");
  });

  it("includes a path in both fill and stroke groups when colors differ", () => {
    const paths = [
      createSvgPath({
        id: "p1",
        hasFill: true,
        fillColor: "red",
        strokeColor: "black",
        sourceOutlineVisible: true,
      }),
    ];
    const groups = computeColorGroups(paths);

    expect(groups).toHaveLength(2);
    const byColor = new Map(groups.map((group) => [group.color, group]));
    expect(byColor.get("#000000")?.paths).toEqual([
      { pathId: "p1", includesFill: false, includesStroke: true },
    ]);
    expect(byColor.get("#ff0000")?.paths).toEqual([
      { pathId: "p1", includesFill: true, includesStroke: false },
    ]);
  });

  it("collapses equivalent named and hex colors", () => {
    const paths = [
      createSvgPath({ hasFill: true, fillColor: "black" }),
      createSvgPath({ hasFill: true, fillColor: "#000000" }),
      createSvgPath({ hasFill: true, fillColor: "red" }),
      createSvgPath({ hasFill: true, fillColor: "#FF0000" }),
    ];
    const groups = computeColorGroups(paths);
    expect(groups).toHaveLength(2);
  });

  it("is pure and deterministic", () => {
    const paths = [
      createSvgPath({ hasFill: true, fillColor: "black" }),
      createSvgPath({ hasFill: true, fillColor: "#FF0000" }),
    ];

    const groups1 = computeColorGroups(paths);
    const groups2 = computeColorGroups(paths);

    expect(JSON.stringify(groups1)).toEqual(JSON.stringify(groups2));
  });
});
