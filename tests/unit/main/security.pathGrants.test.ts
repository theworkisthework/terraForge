import { describe, expect, it } from "vitest";
import { join, resolve } from "path";
import { createPathGrants } from "../../../src/main/security/pathGrants";

const REFUSED = /not chosen in a file dialog/;

describe("path grants", () => {
  const dir = resolve("some", "folder");
  const file = join(dir, "file.gcode");

  it("allows nothing to begin with", () => {
    const grants = createPathGrants();
    expect(() => grants.check(file, "read")).toThrow(REFUSED);
    expect(() => grants.check(file, "write")).toThrow(REFUSED);
  });

  it("lets a file picked for opening be read, not written", () => {
    const grants = createPathGrants();
    grants.grantRead(file);
    expect(grants.check(file, "read")).toBe(file);
    expect(() => grants.check(file, "write")).toThrow(REFUSED);
  });

  it("lets a file picked for saving be written and read back", () => {
    const grants = createPathGrants();
    grants.grantWrite(file);
    expect(grants.check(file, "write")).toBe(file);
    expect(grants.check(file, "read")).toBe(file);
  });

  it("lets files directly inside a chosen folder be written, not read", () => {
    const grants = createPathGrants();
    grants.grantDirectory(dir);
    expect(grants.check(file, "write")).toBe(file);
    expect(() => grants.check(file, "read")).toThrow(REFUSED);
  });

  it("does not extend a folder to its subfolders, its parent or itself", () => {
    const grants = createPathGrants();
    grants.grantDirectory(dir);
    expect(() => grants.check(join(dir, "sub", "file.gcode"), "write")).toThrow(REFUSED);
    expect(() => grants.check(join(dir, "..", "file.gcode"), "write")).toThrow(REFUSED);
    expect(() => grants.check(dir, "write")).toThrow(REFUSED);
  });

  it("judges a path by the file it really names", () => {
    const grants = createPathGrants();
    grants.grantRead(file);
    grants.grantDirectory(dir);
    // The same file, spelled a longer way.
    expect(grants.check(join(dir, "sub", "..", "file.gcode"), "read")).toBe(file);
    // The renderer joins a chosen folder and a filename with a slash.
    expect(grants.check(`${dir}/layer.gcode`, "write")).toBe(join(dir, "layer.gcode"));
    // A different file, spelled to look as if it were inside the folder.
    expect(() => grants.check(`${dir}/../outside.gcode`, "write")).toThrow(REFUSED);
    expect(() => grants.check(`${file}/../other.gcode`, "read")).toThrow(REFUSED);
  });

  it("names the file and the access it refused", () => {
    const grants = createPathGrants();
    expect(() => grants.check(file, "read")).toThrow(`Refused to read ${file}: it was not chosen in a file dialog.`);
    expect(() => grants.check(file, "write")).toThrow(`Refused to write ${file}: it was not chosen in a file dialog.`);
  });

  it.each([undefined, null, "", 42, {}, ["a"]])("refuses %j, which is not a path", (path) => {
    const grants = createPathGrants();
    expect(() => grants.check(path, "read")).toThrow(/no path was given/);
  });

  it("keeps each set of grants to itself", () => {
    const one = createPathGrants();
    const other = createPathGrants();
    one.grantWrite(file);
    expect(() => other.check(file, "read")).toThrow(REFUSED);
  });
});
