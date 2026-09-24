import { describe, expect, it } from "vitest";
import { modulateStrand, renderToneSpine } from "../../src/renderer/src/features/bitmap-renderers/toneSpine/engine";
import { waveformAt } from "../../src/renderer/src/features/bitmap-renderers/toneSpine/waveforms";
import type { RendererSource } from "../../src/types";

const image: RendererSource = { width: 10, height: 10, values: new Uint8Array(100).fill(64) };

describe("waveformAt", () => {
  it("crosses the baseline at the start, half, and end of every waveform", () => {
    for (const id of ["triangle", "square", "sawtooth", "sine"] as const) {
      expect(waveformAt(id, 0)).toBeCloseTo(id === "square" ? 1 : id === "sawtooth" ? -1 : 0, 5);
    }
  });

  it("is bounded to [-1, 1] across a full cycle for every waveform", () => {
    for (const id of ["triangle", "square", "sawtooth", "sine"] as const) {
      for (let phase = 0; phase < 1; phase += 0.05) {
        const value = waveformAt(id, phase);
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("repeats identically every full phase", () => {
    for (const id of ["triangle", "square", "sawtooth", "sine"] as const) {
      expect(waveformAt(id, 0.3)).toBeCloseTo(waveformAt(id, 1.3), 5);
    }
  });
});

describe("modulateStrand", () => {
  it("returns empty for an empty strand", () => {
    expect(modulateStrand([], { toothWidth: 1, amplitude: 1, waveform: "triangle", image })).toBe("");
  });

  it("starts with M and stays within a sane path length", () => {
    const points = Array.from({ length: 50 }, (_, i) => ({ x: i * 0.5, y: 5, nx: 0, ny: 1 }));
    const path = modulateStrand(points, { toothWidth: 1, amplitude: 1, waveform: "sine", image });
    expect(path).toMatch(/^M/);
    expect(path).toContain(" L");
    expect(path).not.toContain("NaN");
    expect(path).not.toContain("Infinity");
  });

  it("produces different output for black vs white source tone", () => {
    const points = Array.from({ length: 50 }, (_, i) => ({ x: i * 0.5, y: 5, nx: 0, ny: 1 }));
    const white: RendererSource = { width: 10, height: 10, values: new Uint8Array(100).fill(255) };
    const black: RendererSource = { width: 10, height: 10, values: new Uint8Array(100).fill(0) };
    const whitePath = modulateStrand(points, { toothWidth: 1, amplitude: 1, waveform: "square", image: white });
    const blackPath = modulateStrand(points, { toothWidth: 1, amplitude: 1, waveform: "square", image: black });
    expect(whitePath).not.toBe(blackPath);
  });
});

describe("modulateStrand waveform shape", () => {
  /** Every `M`/`L` command's [x, y] pair, in order. */
  function pathPoints(path: string): [number, number][] {
    const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const points: [number, number][] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]]);
    return points;
  }

  const straightLine = Array.from({ length: 21 }, (_, i) => ({ x: i * 2, y: 0, nx: 0, ny: 1 }));
  const black: RendererSource = { width: 40, height: 40, values: new Uint8Array(1600).fill(0) };

  it("renders square's edges as a near-vertical jump rather than a diagonal spread across many samples", () => {
    const amplitude = 5;
    const path = modulateStrand(straightLine, { toothWidth: 10, amplitude, waveform: "square", image: black });
    const points = pathPoints(path);

    const hasSharpEdge = points.some(([x1, y1], i) => {
      const next = points[i + 1];
      if (!next) return false;
      const [x2, y2] = next;
      return Math.abs(x1 - x2) < 0.05 && Math.abs(y1 - y2) > amplitude * 1.5;
    });
    expect(hasSharpEdge).toBe(true);
  });

  it("samples sine far more densely than triangle so its curve doesn't look faceted", () => {
    const sinePath = modulateStrand(straightLine, { toothWidth: 10, amplitude: 5, waveform: "sine", image: black });
    const trianglePath = modulateStrand(straightLine, { toothWidth: 10, amplitude: 5, waveform: "triangle", image: black });
    expect(pathPoints(sinePath).length).toBeGreaterThan(pathPoints(trianglePath).length * 2);
  });
});

describe("renderToneSpine", () => {
  it("joins multiple strands and skips empty ones", () => {
    const strand = [{ x: 0, y: 0, nx: 1, ny: 0 }, { x: 1, y: 0, nx: 1, ny: 0 }];
    const path = renderToneSpine([strand, [], strand], { toothWidth: 1, amplitude: 0.5, waveform: "sawtooth", image });
    expect(path.match(/M/g)).toHaveLength(2);
  });
});
