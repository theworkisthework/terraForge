import { describe, expect, it } from "vitest";
import { folderNameProblem } from "./pathUtils";

describe("folderNameProblem", () => {
  const existing = [{ name: "Jobs" }, { name: "plot.gcode" }];

  it("has nothing to say about an empty or blank name", () => {
    expect(folderNameProblem("", existing)).toBeNull();
    expect(folderNameProblem("   ", existing)).toBeNull();
  });

  it("accepts a new name, ignoring surrounding spaces", () => {
    expect(folderNameProblem("  plots 2026 ", existing)).toBeNull();
  });

  it.each(["a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b"])(
    "refuses %s, which the SD card cannot hold",
    (name) => {
      expect(folderNameProblem(name, existing)).toMatch(/cannot contain/);
    },
  );

  it("refuses . and ..", () => {
    expect(folderNameProblem(".", existing)).toBe("That name is reserved");
    expect(folderNameProblem(" .. ", existing)).toBe("That name is reserved");
  });

  it("refuses a name already used, in any case, by a folder or a file", () => {
    expect(folderNameProblem("jobs", existing)).toBe('"jobs" already exists here');
    expect(folderNameProblem("PLOT.GCODE", existing)).toBe('"PLOT.GCODE" already exists here');
  });
});
