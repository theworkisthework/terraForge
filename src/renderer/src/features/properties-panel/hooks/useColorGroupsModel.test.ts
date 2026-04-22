import { describe, expect, it } from "vitest";
import { computeColorGroups } from "./useColorGroupsModel";

describe("computeColorGroups", () => {
  it("collapses equivalent color formats into one group", () => {
    const groups = computeColorGroups([
      {
        id: "p1",
        d: "M0 0",
        svgSource: "<path />",
        visible: true,
        sourceColor: "black",
      },
      {
        id: "p2",
        d: "M1 1",
        svgSource: "<path />",
        visible: true,
        sourceColor: "#000",
      },
      {
        id: "p3",
        d: "M2 2",
        svgSource: "<path />",
        visible: true,
        sourceColor: "rgb(0, 0, 0)",
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({
      color: "#000000",
      paths: [
        { pathId: "p1", includesFill: false, includesStroke: true },
        { pathId: "p2", includesFill: false, includesStroke: true },
        { pathId: "p3", includesFill: false, includesStroke: true },
      ],
      count: 3,
    });
  });

  it("puts generated no-stroke paths in the black stroke group by default", () => {
    const groups = computeColorGroups(
      [
        {
          id: "p1",
          d: "M0 0",
          svgSource: "<path />",
          visible: true,
          hasFill: true,
          fillColor: "#ff0000",
          sourceOutlineVisible: false,
        },
      ],
      true,
    );

    expect(groups).toHaveLength(2);

    const byColor = new Map(groups.map((group) => [group.color, group]));
    expect(byColor.get("#000000")).toEqual({
      color: "#000000",
      paths: [{ pathId: "p1", includesFill: false, includesStroke: true }],
      count: 1,
    });
    expect(byColor.get("#ff0000")).toEqual({
      color: "#ff0000",
      paths: [{ pathId: "p1", includesFill: true, includesStroke: false }],
      count: 1,
    });
  });

  it("includes a path in both fill and stroke groups when colors differ", () => {
    const groups = computeColorGroups([
      {
        id: "p1",
        d: "M0 0",
        svgSource: "<path />",
        visible: true,
        hasFill: true,
        fillColor: "#ff0000",
        strokeColor: "#000000",
        sourceOutlineVisible: true,
      },
    ]);

    expect(groups).toHaveLength(2);

    const byColor = new Map(groups.map((group) => [group.color, group]));
    expect(byColor.get("#000000")).toEqual({
      color: "#000000",
      paths: [{ pathId: "p1", includesFill: false, includesStroke: true }],
      count: 1,
    });
    expect(byColor.get("#ff0000")).toEqual({
      color: "#ff0000",
      paths: [{ pathId: "p1", includesFill: true, includesStroke: false }],
      count: 1,
    });
  });
});
