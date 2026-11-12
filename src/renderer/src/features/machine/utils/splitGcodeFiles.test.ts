import { describe, expect, it } from "vitest";
import type { VectorObject } from "../../../../../types";
import { groupFiles, uniqueFilenames, type SplitFile } from "./splitGcodeFiles";

const file = (filename: string): SplitFile => ({ name: filename, doneName: filename, filename, objects: [] });
const names = (files: SplitFile[]) => files.map((f) => f.filename);
const object = { id: "o1" } as VectorObject;

describe("uniqueFilenames", () => {
  it("leaves distinct filenames alone, returning the same file objects", () => {
    const files = [file("red.gcode"), file("blue.gcode")];
    const unique = uniqueFilenames(files);
    expect(names(unique)).toEqual(["red.gcode", "blue.gcode"]);
    expect(unique[0]).toBe(files[0]);
  });

  it("numbers repeats before the extension", () => {
    expect(names(uniqueFilenames([file("pen.gcode"), file("pen.gcode"), file("pen.gcode")]))).toEqual([
      "pen.gcode",
      "pen_2.gcode",
      "pen_3.gcode",
    ]);
  });

  it("keeps the optimised suffix last", () => {
    expect(names(uniqueFilenames([file("pen_opt.gcode"), file("pen_opt.gcode")]))).toEqual([
      "pen_opt.gcode",
      "pen_2_opt.gcode",
    ]);
  });

  it("treats names differing only in case as the same file", () => {
    expect(names(uniqueFilenames([file("Pen.gcode"), file("pen.gcode")]))).toEqual(["Pen.gcode", "pen_2.gcode"]);
  });

  it("does not hand out a number that another file already uses", () => {
    expect(names(uniqueFilenames([file("pen.gcode"), file("pen_2.gcode"), file("pen.gcode")]))).toEqual([
      "pen.gcode",
      "pen_2.gcode",
      "pen_3.gcode",
    ]);
  });

  it("avoids names taken by an earlier run into the same folder", () => {
    const taken = new Set<string>();
    uniqueFilenames([file("color_red.gcode")], taken);
    expect(names(uniqueFilenames([file("color_red.gcode")], taken))).toEqual(["color_red_2.gcode"]);
  });

  it("does not change the file's display names", () => {
    const [, second] = uniqueFilenames([file("pen.gcode"), file("pen.gcode")]);
    expect(second).toMatchObject({ name: "pen.gcode", doneName: "pen.gcode" });
  });
});

describe("groupFiles", () => {
  it("gives same-named groups, and a group called 'ungrouped', files that cannot collide", () => {
    const files = groupFiles(
      [object],
      [
        { name: "Black", objects: [object] },
        { name: "Black", objects: [object] },
        { name: "ungrouped", objects: [object] },
      ],
      false,
    );
    expect(names(uniqueFilenames(files))).toEqual([
      "ungrouped.gcode",
      "Black.gcode",
      "Black_2.gcode",
      "ungrouped_2.gcode",
    ]);
  });

  it("names a file for a group whose name is blank", () => {
    expect(names(groupFiles([], [{ name: "  ", objects: [object] }], true))).toEqual(["group_opt.gcode"]);
  });
});
