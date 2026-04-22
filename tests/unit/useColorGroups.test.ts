import { describe, it, expect } from "vitest";
import {
  computeColorGroups,
  type ColorGroup,
} from "../../src/renderer/src/features/properties-panel/hooks/useColorGroupsModel";
import { createSvgImport, createSvgPath } from "../helpers/factories";

describe("computeColorGroups", () => {
  it("returns empty array when no paths have fills", () => {
    const paths = [
      createSvgPath({ hasFill: false, fillColor: undefined }),
      createSvgPath({ hasFill: false, fillColor: undefined }),
    ];
    const groups = computeColorGroups(paths);
    expect(groups).toHaveLength(0);
  });

  it("groups paths by fillColor", () => {
    const paths = [
      createSvgPath({ id: "p1", hasFill: true, fillColor: "black" }),
      createSvgPath({ id: "p2", hasFill: true, fillColor: "#FF0000" }),
      createSvgPath({ id: "p3", hasFill: true, fillColor: "black" }),
    ];
    const groups = computeColorGroups(paths);
    expect(groups).toHaveLength(2);

    const blackGroup = groups.find((g) => g.color === "black");
    expect(blackGroup?.count).toBe(2);
    expect(blackGroup?.pathIds).toContain("p1");
    expect(blackGroup?.pathIds).toContain("p3");

    const redGroup = groups.find((g) => g.color === "#FF0000");
    expect(redGroup?.count).toBe(1);
    expect(redGroup?.pathIds).toContain("p2");
  });

  it("sorts groups by hue (rainbow order: red < green < blue)", () => {
    const paths = [
      createSvgPath({ id: "p1", hasFill: true, fillColor: "blue" }),
      createSvgPath({ id: "p2", hasFill: true, fillColor: "red" }),
      createSvgPath({ id: "p3", hasFill: true, fillColor: "green" }),
    ];
    const groups = computeColorGroups(paths);
    const colors = groups.map((g) => g.color);

    // Hue order: red (0°) → green (120°) → blue (240°)
    const redIndex = colors.indexOf("red");
    const greenIndex = colors.indexOf("green");
    const blueIndex = colors.indexOf("blue");

    expect(redIndex).toBeLessThan(greenIndex);
    expect(greenIndex).toBeLessThan(blueIndex);
  });

  it("ignores paths without hasFill set to true", () => {
    const paths = [
      createSvgPath({ id: "p1", hasFill: true, fillColor: "black" }),
      createSvgPath({ id: "p2", hasFill: false, fillColor: "black" }),
      createSvgPath({ id: "p3", hasFill: true, fillColor: "#FF0000" }),
    ];
    const groups = computeColorGroups(paths);
    expect(groups).toHaveLength(2);

    const allPathIds = groups.flatMap((g) => g.pathIds);
    expect(allPathIds).toContain("p1");
    expect(allPathIds).not.toContain("p2"); // hasFill: false should be excluded
    expect(allPathIds).toContain("p3");
  });

  it("handles hex color formats (#RGB and #RRGGBB)", () => {
    const paths = [
      createSvgPath({ hasFill: true, fillColor: "#FF0000" }),
      createSvgPath({ hasFill: true, fillColor: "#00FF00" }),
      createSvgPath({ hasFill: true, fillColor: "#0000FF" }),
    ];
    const groups = computeColorGroups(paths);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.count === 1)).toBe(true);
  });

  it("handles rgb color formats", () => {
    const paths = [
      createSvgPath({ hasFill: true, fillColor: "rgb(255, 0, 0)" }),
      createSvgPath({ hasFill: true, fillColor: "rgb(0, 255, 0)" }),
    ];
    const groups = computeColorGroups(paths);
    expect(groups).toHaveLength(2);
  });

  it("correctly computes path count for each group", () => {
    const paths = [
      createSvgPath({ hasFill: true, fillColor: "black" }),
      createSvgPath({ hasFill: true, fillColor: "black" }),
      createSvgPath({ hasFill: true, fillColor: "black" }),
      createSvgPath({ hasFill: true, fillColor: "#FF0000" }),
      createSvgPath({ hasFill: true, fillColor: "#FF0000" }),
    ];
    const groups = computeColorGroups(paths);
    expect(groups).toHaveLength(2);

    const blackGroup = groups.find((g) => g.color === "black");
    expect(blackGroup?.count).toBe(3);

    const redGroup = groups.find((g) => g.color === "#FF0000");
    expect(redGroup?.count).toBe(2);
  });

  it("handles mixed named and hex colors", () => {
    const paths = [
      createSvgPath({ hasFill: true, fillColor: "black" }),
      createSvgPath({ hasFill: true, fillColor: "#000000" }),
      createSvgPath({ hasFill: true, fillColor: "red" }),
      createSvgPath({ hasFill: true, fillColor: "#FF0000" }),
    ];
    const groups = computeColorGroups(paths);
    // "black" and "#000000" are different strings, so they create separate groups
    // "red" and "#FF0000" are different strings, so they create separate groups
    expect(groups).toHaveLength(4);
  });

  it("handles grayscale colors (0° hue) consistently", () => {
    const paths = [
      createSvgPath({ hasFill: true, fillColor: "black" }),
      createSvgPath({ hasFill: true, fillColor: "white" }),
      createSvgPath({ hasFill: true, fillColor: "gray" }),
    ];
    const groups = computeColorGroups(paths);
    // Grayscale colors all have hue 0°, so they should sort together (or in appearance order)
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.count === 1)).toBe(true);
  });

  it("returns ColorGroup objects with correct structure", () => {
    const paths = [
      createSvgPath({ id: "p1", hasFill: true, fillColor: "#FF0000" }),
      createSvgPath({ id: "p2", hasFill: true, fillColor: "#FF0000" }),
    ];
    const groups = computeColorGroups(paths);
    expect(groups).toHaveLength(1);

    const group = groups[0];
    expect(group).toHaveProperty("color");
    expect(group).toHaveProperty("pathIds");
    expect(group).toHaveProperty("count");
    expect(group.color).toBe("#FF0000");
    expect(group.pathIds).toEqual(["p1", "p2"]);
    expect(group.count).toBe(2);
  });

  it("is pure and deterministic", () => {
    const paths = [
      createSvgPath({ hasFill: true, fillColor: "black" }),
      createSvgPath({ hasFill: true, fillColor: "#FF0000" }),
    ];

    const groups1 = computeColorGroups(paths);
    const groups2 = computeColorGroups(paths);

    // Pure function should return same structure (deep equality)
    expect(JSON.stringify(groups1)).toEqual(JSON.stringify(groups2)