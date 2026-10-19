import { describe, expect, it } from "vitest";
import {
  modulateStrand,
  renderToneSpine,
} from "../../src/renderer/src/features/bitmap-renderers/toneSpine/engine";
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

  // y is centred in the 40-tall image, clear of both edges, so the full
  // ±amplitude swing stays unclipped by the clip-to-rect safety clamp.
  const straightLine = Array.from({ length: 21 }, (_, i) => ({ x: i * 2, y: 20, nx: 0, ny: 1 }));
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

describe("modulateStrand point budget", () => {
  it("reaches as far along a long strand for sine as for other waveforms", () => {
    // Sine needs far more samples per cycle than square to look smooth
    // (SAMPLES_PER_CYCLE), so for the same shared MAX_STRAND_POINTS budget
    // it must not run out of points — and so stop drawing — far short of
    // where a less sample-hungry waveform reaches on the exact same strand.
    const width = 40_000;
    const height = 40;
    const black: RendererSource = { width, height, values: new Uint8Array(width * height).fill(0) };
    const longStrand = Array.from({ length: 4001 }, (_, i) => ({ x: i * 10, y: 20, nx: 0, ny: 1 }));
    const lastX = (path: string) => {
      const nums = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      return nums[nums.length - 2];
    };

    const sinePath = modulateStrand(longStrand, { toothWidth: 10, amplitude: 5, waveform: "sine", image: black });
    const squarePath = modulateStrand(longStrand, { toothWidth: 10, amplitude: 5, waveform: "square", image: black });

    expect(lastX(sinePath)).toBeGreaterThan(width * 0.9);
    expect(lastX(squarePath)).toBeGreaterThan(width * 0.9);
  });
});

describe("modulateStrand clip-to-rect", () => {
  it("breaks the path into a new M when the base point leaves the image bounds", () => {
    // A strand that runs from inside the 10x10 image out past its right edge.
    const strand = [
      { x: 5, y: 5, nx: 0, ny: 1 },
      { x: 15, y: 5, nx: 0, ny: 1 },
    ];
    const path = modulateStrand(strand, { toothWidth: 1, amplitude: 1, waveform: "sine", image });
    // Every coordinate pair stays within the image, and there's at least one
    // M after the initial one — the path was broken rather than continuing
    // straight through the boundary.
    const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      expect(numbers[i]).toBeGreaterThanOrEqual(0);
      expect(numbers[i]).toBeLessThanOrEqual(10);
    }
    expect((path.match(/M/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it("clamps a near-edge wobbled point back into bounds instead of emitting it outside", () => {
    // Sitting right on the top edge with a normal pointing outward (-y): an
    // unclamped negative-going wobble would go to y < 0.
    const strand = Array.from({ length: 21 }, (_, i) => ({ x: i * 0.5, y: 0, nx: 0, ny: -1 }));
    const black: RendererSource = { width: 10, height: 10, values: new Uint8Array(100).fill(0) };
    const path = modulateStrand(strand, { toothWidth: 1, amplitude: 5, waveform: "square", image: black });
    const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    for (let i = 1; i < numbers.length; i += 2) {
      expect(numbers[i]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("modulateStrand peak clip", () => {
  // A huge toothWidth relative to the single 1-unit segment guarantees
  // exactly one sub-step, landing at a fully predictable phase: starting
  // from 0, one sub-step on a fully black (toneDark = 1) image advances it
  // by (1 / 100) * (1 + 2 * 1) = 0.03 — just inside triangle's rising edge,
  // nowhere near its natural peak at phase 0.25.
  const points = [
    { x: 0, y: 20, nx: 0, ny: 1 },
    { x: 1, y: 20, nx: 0, ny: 1 },
  ];
  const black: RendererSource = { width: 40, height: 40, values: new Uint8Array(1600).fill(0) };
  const amplitude = 5;
  const lastY = (path: string) => {
    const nums = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    return nums[nums.length - 1];
  };

  it("leaves the waveform unchanged at 100% (the default)", () => {
    const withDefault = modulateStrand(points, { toothWidth: 100, amplitude, waveform: "triangle", image: black });
    const explicit100 = modulateStrand(points, { toothWidth: 100, amplitude, waveform: "triangle", image: black, peakClipPct: 100 });
    expect(explicit100).toBe(withDefault);
    // triangleAt(0.03) = 0.03 * 4 = 0.12, unclipped.
    expect(lastY(withDefault) - 20).toBeCloseTo(amplitude * 0.12, 2);
  });

  it("drives the peak to full amplitude well before its natural phase when clipped", () => {
    const path = modulateStrand(points, { toothWidth: 100, amplitude, waveform: "triangle", image: black, peakClipPct: 10 });
    // drive = 0.1, so 0.12 / 0.1 = 1.2, clamped to 1 — fully saturated this
    // early in the ramp, instead of the unclipped path's 0.12.
    expect(lastY(path) - 20).toBeCloseTo(amplitude, 2);
  });
});

describe("modulateStrand tone shaping", () => {
  // Same analytical setup as the peak-clip tests: a toothWidth well above
  // the single 1-unit segment guarantees exactly one sub-step, landing
  // precisely at the segment's own endpoint (1, 20) — a position whose
  // exact pixel value we can control directly, with no bilinear blending to
  // account for. Large enough to stay within triangle's linear rising edge
  // (phase stays under 0.25) even at full tone-darkness, but not so large
  // that the resulting displacement rounds away to nothing at 2dp.
  const points = [
    { x: 0, y: 20, nx: 0, ny: 1 },
    { x: 1, y: 20, nx: 0, ny: 1 },
  ];
  const amplitude = 5;
  const lastY = (path: string) => {
    const nums = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    return nums[nums.length - 1];
  };

  it("uses each sample's tone as given, with no lag from earlier samples", () => {
    // White everywhere except the strand's end point. Shaping (smoothing
    // included) belongs to source preparation now, so a black sample reads
    // as fully black straight away rather than averaged with the white
    // before it.
    const values = new Uint8Array(1600).fill(255);
    values[20 * 40 + 1] = 0;
    const image: RendererSource = { width: 40, height: 40, values };

    const path = modulateStrand(points, { toothWidth: 20, amplitude, waveform: "triangle", image });

    // Phase at the end: 1/20 * (1 + 2 * 1) = 0.15, where triangle = 0.6.
    expect(lastY(path) - 20).toBeCloseTo(amplitude * 0.6, 2);
  });
});

describe("modulateStrand tone → frequency", () => {
  // A long straight strand, sampled densely, over an image that is uniformly
  // light or uniformly dark; count waveform teeth by the drawn points.
  const strand = Array.from({ length: 401 }, (_, x) => ({ x: x * 0.5, y: 5, nx: 0, ny: -1 }));
  const uniform = (value: number): RendererSource => ({ width: 200, height: 10, values: new Uint8Array(2000).fill(value) });
  const points = (value: number, frequencyGain?: number) =>
    (modulateStrand(strand, { toothWidth: 10, amplitude: 2, waveform: "triangle", image: uniform(value), frequencyGain }).match(/[ML]/g) ?? [])
      .length;

  it("cycles 1 + gain times as fast in fully dark areas as in light ones", () => {
    // Triangle draws four points per cycle; white has none to modulate but
    // still advances phase at the light-area rate.
    const light = points(255, 2);
    const dark = points(0, 2);
    expect(dark / light).toBeCloseTo(3, 0);
  });

  it("keeps the tooth width fixed everywhere at 0", () => {
    expect(points(0, 0)).toBe(points(255, 0));
  });

  it("defaults to the gain every drawing used before it was a setting", () => {
    expect(points(0)).toBe(points(0, 2));
  });
});

describe("modulateStrand stroke start", () => {
  const dark: RendererSource = { width: 100, height: 20, values: new Uint8Array(2000).fill(0) };
  const waveforms = ["triangle", "square", "sawtooth", "sine"] as const;

  /** The [x, y] of the first `M` in a path. */
  function firstPoint(path: string): [number, number] {
    const match = /M(-?[\d.]+) (-?[\d.]+)/.exec(path)!;
    return [Number(match[1]), Number(match[2])];
  }

  for (const waveform of waveforms) {
    it(`starts a ${waveform} strand at its first base point rather than at its first breakpoint`, () => {
      const line = Array.from({ length: 101 }, (_, x) => ({ x, y: 10, nx: 0, ny: -1 }));
      const path = modulateStrand(line, { toothWidth: 10, amplitude: 5, waveform, image: dark });

      const [x, y] = firstPoint(path);
      expect(x).toBe(0);
      // Displaced along the normal by the waveform's value at phase 0.
      expect(y).toBeCloseTo(10 - 5 * waveformAt(waveform, 0), 5);
    });

    it(`resumes a ${waveform} strand exactly at the image edge when it re-enters`, () => {
      // Starts left of the image, crossing into it at x = 0 midway between
      // two samples, so the edge has to be found rather than landed on.
      const line = Array.from({ length: 121 }, (_, i) => ({ x: i - 20.5, y: 10, nx: 0, ny: -1 }));
      const path = modulateStrand(line, { toothWidth: 10, amplitude: 5, waveform, image: dark });

      expect(firstPoint(path)[0]).toBe(0);
    });
  }

  /** The [x, y] of the last point of the first subpath in a path. */
  function firstSubpathEnd(path: string): [number, number] {
    const firstSubpath = path.split(/ (?=M)/)[0];
    const points = [...firstSubpath.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)];
    const last = points[points.length - 1];
    return [Number(last[1]), Number(last[2])];
  }

  for (const waveform of waveforms) {
    it(`finishes a ${waveform} strand exactly at the image edge when it leaves`, () => {
      // Crosses out of the 100px-wide image midway between two samples.
      const line = Array.from({ length: 121 }, (_, i) => ({ x: i + 0.5, y: 10, nx: 0, ny: -1 }));
      const path = modulateStrand(line, { toothWidth: 10, amplitude: 5, waveform, image: dark });

      expect(firstSubpathEnd(path)[0]).toBe(100);
    });
  }

  it("draws both edges of a strand that leaves the image and comes back", () => {
    // Out through the top edge at x = 40, back in at x = 60.
    const vee = Array.from({ length: 101 }, (_, x) => ({ x, y: 5 - 10 * Math.max(0, 1 - Math.abs(x - 50) / 25), nx: 0, ny: -1 }));
    const path = modulateStrand(vee, { toothWidth: 10, amplitude: 0, waveform: "sawtooth", image: dark });

    const subpaths = path.split(/ (?=M)/);
    expect(subpaths).toHaveLength(2);
    expect(firstSubpathEnd(subpaths[0])).toEqual([37.5, 0]);
    expect(firstPoint(subpaths[1])).toEqual([62.5, 0]);
  });

  it("closes a ring: the stroke starts where the ring does, with no gap", () => {
    const ring = Array.from({ length: 201 }, (_, i) => {
      const theta = (i / 200) * Math.PI * 2;
      return { x: 50 + 8 * Math.cos(theta), y: 10 + 8 * Math.sin(theta), nx: Math.cos(theta), ny: Math.sin(theta) };
    });
    const path = modulateStrand(ring, { toothWidth: 5, amplitude: 1, waveform: "sawtooth", image: dark });

    const [x, y] = firstPoint(path);
    // Within one amplitude of the ring's own start point (58, 10).
    expect(Math.hypot(x - 58, y - 10)).toBeLessThanOrEqual(1 + 1e-6);
  });
});

describe("renderToneSpine", () => {
  it("joins multiple strands and skips empty ones", () => {
    const strand = [{ x: 0, y: 0, nx: 1, ny: 0 }, { x: 1, y: 0, nx: 1, ny: 0 }];
    const { d, truncated } = renderToneSpine([strand, [], strand], { toothWidth: 1, amplitude: 0.5, waveform: "sawtooth", image });
    expect(d.match(/M/g)).toHaveLength(2);
    expect(truncated).toBe(false);
  });

  it("lets a single strand use the whole render budget, with no smaller per-strand cap", () => {
    // One straight strand whose tiny tooth width needs ~250,000 drawn points
    // — more than the old 200,000 per-strand cap, well under the render budget.
    const strand = [
      { x: 0, y: 5, nx: 0, ny: 1 },
      { x: 1000, y: 5, nx: 0, ny: 1 },
    ];
    const white: RendererSource = { width: 1000, height: 10, values: new Uint8Array(10_000).fill(255) };

    const { d, truncated } = renderToneSpine([strand], { toothWidth: 0.016, amplitude: 1, waveform: "triangle", image: white });

    expect(truncated).toBe(false);
    expect((d.match(/[ML]/g) ?? []).length).toBeGreaterThan(200_000);
  });

  it("stops at one point budget shared by every strand, and says it did", () => {
    // Many strands, each well under the per-strand cap, that together far
    // exceed a whole-render budget. A small budget keeps this quick: the
    // real one is millions of points, too slow to draw under coverage in CI.
    const budget = 5_000;
    const strand = Array.from({ length: 201 }, (_, i) => ({ x: (i % 10) * 0.001, y: 5, nx: 0, ny: 1 }));
    const strands = Array.from({ length: 100 }, () => strand);
    const options = { toothWidth: 1, amplitude: 0.5, waveform: "sine" as const, image };

    const { d, truncated } = renderToneSpine(strands, options, budget);

    expect(truncated).toBe(true);
    const points = (d.match(/[ML]/g) ?? []).length;
    expect(points).toBeLessThanOrEqual(budget);
    // It used the budget rather than stopping early.
    expect(points).toBeGreaterThan(budget * 0.9);
    // And the same strands fit easily within the real limit.
    expect(renderToneSpine(strands, options).truncated).toBe(false);
  });
});
