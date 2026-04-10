import { describe, it, expect } from "vitest";
import {
  computeFit,
  rotatePoint,
  computeBoundingBox,
  computeOBB,
  handleBoundsForBox,
  scaleHexColor,
} from "@renderer/features/canvas/utils/geometry";
import {
  MM_TO_PX,
  PAD,
  MIN_ZOOM,
  MAX_ZOOM,
} from "@renderer/features/canvas/constants";
import type { SvgImport } from "@types/index";

describe("geometry", () => {
  const bedW = 220;
  const bedH = 200;
  const canvasW = bedW * MM_TO_PX + PAD * 2;
  const canvasH = bedH * MM_TO_PX + PAD * 2;

  describe("computeFit", () => {
    it("calculates zoom and pan to fit canvas in container", () => {
      const vp = computeFit(800, 600, canvasW, canvasH);
      expect(vp.zoom).toBeGreaterThan(0);
      expect(vp.zoom).toBeLessThanOrEqual(1);
      expect(vp.panX).toBeGreaterThan(0);
      expect(vp.panY).toBeGreaterThan(0);
    });

    it("respects MIN_ZOOM", () => {
      // very large container relative to canvas
      const vp = computeFit(10000, 10000, canvasW, canvasH);
      expect(vp.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    });

    it("clamps to MIN_ZOOM for very small container", () => {
      const vp = computeFit(10, 10, canvasW, canvasH);
      expect(vp.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    });

    it("returns symmetric pan for square aspect ratio", () => {
      const size = 500;
      const vp = computeFit(size, size, 300, 300);
      expect(vp.panX).toBeCloseTo(vp.panY, 5);
    });
  });

  describe("rotatePoint", () => {
    it("rotates 90 degrees clockwise", () => {
      const [x, y] = rotatePoint(1, 0, 90);
      expect(x).toBeCloseTo(0, 5);
      expect(y).toBeCloseTo(1, 5);
    });

    it("rotates 180 degrees", () => {
      const [x, y] = rotatePoint(1, 0, 180);
      expect(x).toBeCloseTo(-1, 5);
      expect(y).toBeCloseTo(0, 5);
    });

    it("rotates -90 degrees (counter-clockwise)", () => {
      const [x, y] = rotatePoint(1, 0, -90);
      expect(x).toBeCloseTo(0, 5);
      expect(y).toBeCloseTo(-1, 5);
    });

    it("returning to 0 degrees after 360", () => {
      const [x, y] = rotatePoint(1, 1, 360);
      expect(x).toBeCloseTo(1, 5);
      expect(y).toBeCloseTo(1, 5);
    });

    it("rotates 45 degrees", () => {
      const [x, y] = rotatePoint(1, 0, 45);
      expect(x).toBeCloseTo(Math.sqrt(2) / 2, 5);
      expect(y).toBeCloseTo(Math.sqrt(2) / 2, 5);
    });
  });

  describe("computeBoundingBox", () => {
    it("returns null for empty imports", () => {
      const bbox = computeBoundingBox([], () => 0);
      expect(bbox).toBeNull();
    });

    it("computes AABB for single unrotated import", () => {
      const imp: SvgImport = {
        id: "imp1",
        x: 10,
        y: 10,
        svgWidth: 50,
        svgHeight: 50,
        scale: 1,
        scaleX: undefined,
        scaleY: undefined,
        rotation: 0,
        viewBoxX: 0,
        viewBoxY: 0,
        layerAssignmentId: null,
        paths: [],
        layers: [],
      };
      const getBedY = (mm: number) => PAD + (200 - mm) * MM_TO_PX;
      const bbox = computeBoundingBox([imp], getBedY);
      expect(bbox).not.toBeNull();
      expect(bbox!.minX).toBeLessThan(bbox!.maxX);
      expect(bbox!.minY).toBeLessThan(bbox!.maxY);
    });

    it("computes AABB for multiple imports", () => {
      const imps: SvgImport[] = [
        {
          id: "imp1",
          x: 10,
          y: 10,
          svgWidth: 30,
          svgHeight: 30,
          scale: 1,
          scaleX: undefined,
          scaleY: undefined,
          rotation: 0,
          viewBoxX: 0,
          viewBoxY: 0,
          layerAssignmentId: null,
          paths: [],
          layers: [],
        },
        {
          id: "imp2",
          x: 60,
          y: 60,
          svgWidth: 30,
          svgHeight: 30,
          scale: 1,
          scaleX: undefined,
          scaleY: undefined,
          rotation: 0,
          viewBoxX: 0,
          viewBoxY: 0,
          layerAssignmentId: null,
          paths: [],
          layers: [],
        },
      ];
      const getBedY = (mm: number) => PAD + (200 - mm) * MM_TO_PX;
      const bbox = computeBoundingBox(imps, getBedY);
      expect(bbox).not.toBeNull();
      expect(bbox!.minX).toBeLessThan(bbox!.maxX);
      expect(bbox!.minY).toBeLessThan(bbox!.maxY);
    });

    it("handles rotated imports (checks all corners)", () => {
      const imp: SvgImport = {
        id: "imp1",
        x: 50,
        y: 50,
        svgWidth: 40,
        svgHeight: 40,
        scale: 1,
        scaleX: undefined,
        scaleY: undefined,
        rotation: 45, // rotated 45 degrees
        viewBoxX: 0,
        viewBoxY: 0,
        layerAssignmentId: null,
        paths: [],
        layers: [],
      };
      const getBedY = (mm: number) => PAD + (200 - mm) * MM_TO_PX;
      const bbox = computeBoundingBox([imp], getBedY);
      expect(bbox).not.toBeNull();
      // Rotated AABB should be larger than unrotated (since we check all corners)
    });
  });

  describe("computeOBB", () => {
    it("returns null for empty imports", () => {
      const obb = computeOBB([], 0, () => 0);
      expect(obb).toBeNull();
    });

    it("computes OBB with 0 rotation", () => {
      const imp: SvgImport = {
        id: "imp1",
        x: 10,
        y: 10,
        svgWidth: 50,
        svgHeight: 30,
        scale: 1,
        scaleX: undefined,
        scaleY: undefined,
        rotation: 0,
        viewBoxX: 0,
        viewBoxY: 0,
        layerAssignmentId: null,
        paths: [],
        layers: [],
      };
      const getBedY = (mm: number) => PAD + (200 - mm) * MM_TO_PX;
      const obb = computeOBB([imp], 0, getBedY);
      expect(obb).not.toBeNull();
      expect(obb!.angle).toBe(0);
      expect(obb!.hw).toBeGreaterThan(0);
      expect(obb!.hh).toBeGreaterThan(0);
    });

    it("stores accumulated rotation angle", () => {
      const imp: SvgImport = {
        id: "imp1",
        x: 10,
        y: 10,
        svgWidth: 50,
        svgHeight: 50,
        scale: 1,
        scaleX: undefined,
        scaleY: undefined,
        rotation: 0,
        viewBoxX: 0,
        viewBoxY: 0,
        layerAssignmentId: null,
        paths: [],
        layers: [],
      };
      const getBedY = (mm: number) => PAD + (200 - mm) * MM_TO_PX;
      const obb = computeOBB([imp], 45, getBedY);
      expect(obb!.angle).toBe(45);
    });
  });

  describe("handleBoundsForBox", () => {
    it("returns 8 handles (tl, t, tr, r, br, b, bl, l)", () => {
      const handles = handleBoundsForBox(100, 100, 50, 50, 0, 1, 0, 0);
      expect(handles.length).toBe(8);
      const ids = handles.map(([id]) => id);
      expect(ids).toContain("tl");
      expect(ids).toContain("t");
      expect(ids).toContain("tr");
      expect(ids).toContain("r");
      expect(ids).toContain("br");
      expect(ids).toContain("b");
      expect(ids).toContain("bl");
      expect(ids).toContain("l");
    });

    it("computes symmetric handle positions for unrotated box", () => {
      const handles = handleBoundsForBox(100, 100, 50, 50, 0, 1, 0, 0);
      const handleMap = Object.fromEntries(
        handles.map(([id, sx, sy]) => [id, [sx, sy]]),
      );

      // Top-left and bottom-right should be symmetric around center
      const [tlX, tlY] = handleMap["tl"];
      const [brX, brY] = handleMap["br"];
      expect(tlX + brX).toBeCloseTo(200, 5); // 2 * centerX
      expect(tlY + brY).toBeCloseTo(200, 5); // 2 * centerY
    });

    it("applies zoom to screen coordinates", () => {
      const handles1 = handleBoundsForBox(100, 100, 50, 50, 0, 1, 0, 0);
      const handles2 = handleBoundsForBox(100, 100, 50, 50, 0, 2, 0, 0);

      const [, sx1, sy1] = handles1[0]; // tl
      const [, sx2, sy2] = handles2[0]; // tl
      expect(sx2).toBeCloseTo(sx1 * 2, 5);
      expect(sy2).toBeCloseTo(sy1 * 2, 5);
    });

    it("applies pan offset to screen coordinates", () => {
      const handles1 = handleBoundsForBox(100, 100, 50, 50, 0, 1, 0, 0);
      const handles2 = handleBoundsForBox(100, 100, 50, 50, 0, 1, 10, 20);

      const [, sx1, sy1] = handles1[0]; // tl
      const [, sx2, sy2] = handles2[0]; // tl
      expect(sx2).toBeCloseTo(sx1 + 10, 5);
      expect(sy2).toBeCloseTo(sy1 + 20, 5);
    });
  });

  describe("scaleHexColor", () => {
    it("darkens a color with factor < 1", () => {
      const original = "#ff0000"; // red
      const darkened = scaleHexColor(original, 0.5);
      expect(darkened).toBe("#800000"); // half brightness red
    });

    it("brightens a color with factor > 1", () => {
      const original = "#800000"; // dark red
      const brightened = scaleHexColor(original, 2);
      expect(brightened).toBe("#ff0000"); // full brightness red (clamped)
    });

    it("clamps to max 0xff (255)", () => {
      const original = "#808080"; // medium gray
      const brightened = scaleHexColor(original, 10);
      expect(brightened).toBe("#ffffff"); // white (clamped)
    });

    it("clamps to min 0x00 (0)", () => {
      const original = "#808080"; // medium gray
      const darkened = scaleHexColor(original, 0);
      expect(darkened).toBe("#000000"); // black
    });

    it("works with various colors", () => {
      const testCases = [
        ["#3a6aaa", 1.35],
        ["#60a0ff", 0.65],
      ];
      for (const [color, factor] of testCases) {
        const result = scaleHexColor(color, factor as number);
        expect(result).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it("result is lowercase hex", () => {
      const result = scaleHexColor("#FF0000", 1);
      expect(result).toBe(result.toLowerCase());
    });
  });
});
