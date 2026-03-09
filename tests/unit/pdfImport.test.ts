import { describe, it, expect } from "vitest";
import { opsToSvgPaths, PDF_OPS } from "@renderer/utils/pdfImport";

const PAGE_H = 100; // synthetic page height for easy Y-flip checks

describe("opsToSvgPaths", () => {
  it("returns empty array for empty ops", () => {
    expect(opsToSvgPaths([], [], PAGE_H)).toEqual([]);
  });

  it("single moveTo + lineTo produces one path", () => {
    const ops = [PDF_OPS.moveTo, PDF_OPS.lineTo];
    const args = [0, 0, 10, 0]; // PDF (0,0)→(10,0)
    const paths = opsToSvgPaths(ops, args, PAGE_H);
    expect(paths).toHaveLength(1);
    // Y = pageH - pdfY: 0 → 100, 0 → 100
    expect(paths[0]).toBe("M0,100 L10,100");
  });

  it("flips Y axis: PDF Y=0 maps to svgY=pageH", () => {
    const ops = [PDF_OPS.moveTo];
    const args = [5, 20];
    const paths = opsToSvgPaths(ops, args, PAGE_H);
    expect(paths[0]).toBe("M5,80"); // svgY = 100 - 20 = 80
  });

  it("moveTo starts a new path, flushing the previous one", () => {
    const ops = [
      PDF_OPS.moveTo,
      PDF_OPS.lineTo,
      PDF_OPS.moveTo,
      PDF_OPS.lineTo,
    ];
    const args = [0, 0, 10, 0, 20, 0, 30, 0];
    const paths = opsToSvgPaths(ops, args, PAGE_H);
    expect(paths).toHaveLength(2);
  });

  it("curveTo produces a cubic bezier C command", () => {
    const ops = [PDF_OPS.moveTo, PDF_OPS.curveTo];
    // moveTo (0,0), curveTo cp1=(1,2) cp2=(3,4) end=(5,6) in PDF space
    const args = [0, 0, 1, 2, 3, 4, 5, 6];
    const [path] = opsToSvgPaths(ops, args, PAGE_H);
    // Y flip: 0→100, 2→98, 4→96, 6→94
    expect(path).toContain("C1,98,3,96,5,94");
  });

  it("curveTo2 uses current position as first control point", () => {
    const ops = [PDF_OPS.moveTo, PDF_OPS.curveTo2];
    const args = [10, 10, 20, 10, 30, 10];
    // moveTo (10,10), curveTo2 cp2=(20,10) end=(30,10)
    // cp1 should be the moveTo point (10, pageH - 10 = 90)
    const [path] = opsToSvgPaths(ops, args, PAGE_H);
    expect(path).toContain("C10,90,"); // cp1 = current pos in SVG coords
    expect(path).toContain(",30,90"); // endpoint
  });

  it("curveTo3 duplicates endpoint as second control point", () => {
    const ops = [PDF_OPS.moveTo, PDF_OPS.curveTo3];
    const args = [0, 0, 5, 0, 10, 0];
    // curveTo3: cp1=(5,0) end=(10,0); cp2 should equal end
    const [path] = opsToSvgPaths(ops, args, PAGE_H);
    // In SVG coords: cp1=(5,100) cp2=(10,100) end=(10,100)
    expect(path).toContain("C5,100,10,100,10,100");
  });

  it("closePath appends Z", () => {
    const ops = [PDF_OPS.moveTo, PDF_OPS.lineTo, PDF_OPS.closePath];
    const args = [0, 0, 10, 0];
    const [path] = opsToSvgPaths(ops, args, PAGE_H);
    expect(path).toMatch(/ Z$/);
  });

  it("rectangle is emitted as a closed rect path", () => {
    // PDF rectangle x=10, y=20 (bottom-left), w=30, h=40
    const ops = [PDF_OPS.rectangle];
    const args = [10, 20, 30, 40];
    const paths = opsToSvgPaths(ops, args, PAGE_H);
    expect(paths).toHaveLength(1);
    // After Y-flip: top = pageH - (20+40) = 40, bottom = pageH - 20 = 80
    expect(paths[0]).toMatch(/^M10,40 H40 V80 H10 Z$/);
  });

  it("rectangle following a prior path flushes the prior path first", () => {
    const ops = [PDF_OPS.moveTo, PDF_OPS.lineTo, PDF_OPS.rectangle];
    const args = [0, 0, 5, 0, 10, 20, 30, 40];
    const paths = opsToSvgPaths(ops, args, PAGE_H);
    expect(paths).toHaveLength(2); // line path + rect path
  });

  it("filters out empty path strings", () => {
    // A lone closePath with nothing before it produces no usable path
    const ops = [PDF_OPS.closePath];
    const args: number[] = [];
    const paths = opsToSvgPaths(ops, args, PAGE_H);
    // " Z" alone is length 2, filtered by the '> 1' guard
    expect(paths.every((p) => p.length > 1)).toBe(true);
  });
});
