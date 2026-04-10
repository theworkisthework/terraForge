import { describe, it, expect } from "vitest";
import {
  mmToSvg,
  svgToMm,
  svgToScreen,
  screenToSvg,
  mmToScreen,
} from "@renderer/features/canvas/utils/coordinates";
import { MM_TO_PX, PAD } from "@renderer/features/canvas/constants";
import type { Vp } from "@renderer/features/canvas/types";

describe("coordinates", () => {
  const bedW = 220;
  const bedH = 200;
  const vp: Vp = { zoom: 1, panX: 0, panY: 0 };

  describe("mmToSvg", () => {
    it("converts X coordinate with bottom-left origin", () => {
      const x = mmToSvg(50, "x", "bottom-left", bedW, bedH);
      expect(x).toBe(PAD + 50 * MM_TO_PX);
    });

    it("converts X coordinate at origin", () => {
      const x = mmToSvg(0, "x", "bottom-left", bedW, bedH);
      expect(x).toBe(PAD);
    });

    it("converts X coordinate with center origin", () => {
      const x = mmToSvg(0, "x", "center", bedW, bedH);
      expect(x).toBe(PAD + (bedW / 2) * MM_TO_PX);
    });

    it("converts Y coordinate with bottom-left origin", () => {
      const y = mmToSvg(50, "y", "bottom-left", bedW, bedH);
      expect(y).toBe(PAD + (bedH - 50) * MM_TO_PX);
    });

    it("converts Y coordinate with top-left origin", () => {
      const y = mmToSvg(50, "y", "top-left", bedW, bedH);
      expect(y).toBe(PAD + 50 * MM_TO_PX);
    });

    it("converts Y coordinate with center origin", () => {
      const y = mmToSvg(0, "y", "center", bedW, bedH);
      expect(y).toBe(PAD + (bedH / 2) * MM_TO_PX);
    });

    it("converts X coordinate with right origin", () => {
      const x = mmToSvg(50, "x", "bottom-right", bedW, bedH);
      expect(x).toBe(PAD + (bedW - 50) * MM_TO_PX);
    });

    it("handles negative coordinates", () => {
      const x = mmToSvg(-10, "x", "center", bedW, bedH);
      expect(x).toBe(PAD + (bedW / 2 - 10) * MM_TO_PX);
    });
  });

  describe("svgToMm", () => {
    it("converts X SVG px to mm with bottom-left origin", () => {
      const px = PAD + 50 * MM_TO_PX;
      const mm = svgToMm(px, "x", "bottom-left", bedW, bedH);
      expect(mm).toBe(50);
    });

    it("converts X SVG px to mm with center origin", () => {
      const px = PAD + (bedW / 2 + 30) * MM_TO_PX;
      const mm = svgToMm(px, "x", "center", bedW, bedH);
      expect(mm).toBeCloseTo(30);
    });

    it("converts Y SVG px to mm with bottom-left origin", () => {
      const py = PAD + (bedH - 50) * MM_TO_PX;
      const mm = svgToMm(py, "y", "bottom-left", bedW, bedH);
      expect(mm).toBe(50);
    });

    it("is inverse of mmToSvg", () => {
      const origins = [
        "bottom-left",
        "top-left",
        "bottom-right",
        "top-right",
        "center",
      ] as const;
      for (const origin of origins) {
        for (const mm of [0, 50, 100, -10]) {
          for (const axis of ["x", "y"] as const) {
            const px = mmToSvg(mm, axis, origin, bedW, bedH);
            const recoveredMm = svgToMm(px, axis, origin, bedW, bedH);
            expect(recoveredMm).toBeCloseTo(mm, 5);
          }
        }
      }
    });
  });

  describe("svgToScreen", () => {
    it("converts with no viewport transform (zoom=1, pan=0)", () => {
      const [sx, sy] = svgToScreen(100, 50, vp);
      expect(sx).toBe(100);
      expect(sy).toBe(50);
    });

    it("applies zoom", () => {
      const vpZoomed: Vp = { zoom: 2, panX: 0, panY: 0 };
      const [sx, sy] = svgToScreen(100, 50, vpZoomed);
      expect(sx).toBe(200);
      expect(sy).toBe(100);
    });

    it("applies pan", () => {
      const vpPanned: Vp = { zoom: 1, panX: 50, panY: 30 };
      const [sx, sy] = svgToScreen(100, 50, vpPanned);
      expect(sx).toBe(150);
      expect(sy).toBe(80);
    });

    it("applies both zoom and pan", () => {
      const vpBoth: Vp = { zoom: 2, panX: 10, panY: 20 };
      const [sx, sy] = svgToScreen(100, 50, vpBoth);
      expect(sx).toBe(210); // 100 * 2 + 10
      expect(sy).toBe(120); // 50 * 2 + 20
    });
  });

  describe("screenToSvg", () => {
    it("converts with no viewport transform", () => {
      const [x, y] = screenToSvg(100, 50, vp);
      expect(x).toBe(100);
      expect(y).toBe(50);
    });

    it("is inverse of svgToScreen", () => {
      const vpStates: Vp[] = [
        { zoom: 1, panX: 0, panY: 0 },
        { zoom: 2, panX: 0, panY: 0 },
        { zoom: 1, panX: 50, panY: 30 },
        { zoom: 2, panX: 10, panY: 20 },
        { zoom: 0.5, panX: -100, panY: 200 },
      ];

      for (const vpState of vpStates) {
        const [sx, sy] = svgToScreen(100, 50, vpState);
        const [x, y] = screenToSvg(sx, sy, vpState);
        expect(x).toBeCloseTo(100, 5);
        expect(y).toBeCloseTo(50, 5);
      }
    });
  });

  describe("mmToScreen", () => {
    it("combines mm→svg→screen transforms", () => {
      const vpPanned: Vp = { zoom: 2, panX: 10, panY: 0 };
      const sx = mmToScreen(50, "x", "bottom-left", bedW, bedH, vpPanned);
      // mmToSvg(50, "x", ...) = PAD + 50 * MM_TO_PX
      // then svgToScreen(...) = (PAD + 50 * MM_TO_PX) * 2 + 10
      const expected = (PAD + 50 * MM_TO_PX) * 2 + 10;
      expect(sx).toBeCloseTo(expected, 5);
    });

    it("works for different origins", () => {
      for (const origin of [
        "bottom-left",
        "top-left",
        "bottom-right",
        "top-right",
        "center",
      ] as const) {
        const sx = mmToScreen(0, "x", origin, bedW, bedH, vp);
        expect(typeof sx).toBe("number");
        expect(isFinite(sx)).toBe(true);
      }
    });
  });
});
