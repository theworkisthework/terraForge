import { describe, expect, it } from "vitest";
import {
  defineToneSpineRenderer,
  spacingField,
  type SpineGeometry,
} from "@renderer/features/bitmap-renderers/toneSpine/defineToneSpineRenderer";
import { TONE_SPINE_ENGINE_VERSION } from "@renderer/features/bitmap-renderers/toneSpine/engine";
import type { RendererSource } from "@types/index";

const source: RendererSource = { width: 40, height: 20, values: new Uint8Array(800).fill(40) };

function lineRenderer(capture?: (geometry: SpineGeometry) => void) {
  return defineToneSpineRenderer({
    id: "test-line",
    label: "Test line",
    revision: 4,
    fields: [spacingField("Spacing (mm)")],
    defaults: { spacingMM: 2, toothWidthMM: 3, amplitudeMM: 1 },
    strands(geometry) {
      capture?.(geometry);
      return [[0, 10, 20, 30, 40].map((x) => ({ x, y: 10, nx: 0, ny: -1 }))];
    },
  });
}

describe("defineToneSpineRenderer", () => {
  it("appends the controls every tone-spine renderer shares, after the renderer's own", () => {
    expect(lineRenderer().fields.map((field) => field.key)).toEqual([
      "spacingMM",
      "waveform",
      "angleDeg",
      "originXPct",
      "originYPct",
      "clipToImage",
      "peakClipPct",
    ]);
  });

  it("versions the renderer by engine version and its own revision", () => {
    expect(lineRenderer().version).toBe(`tone-spine-${TONE_SPINE_ENGINE_VERSION}.4`);
  });

  it("hands the generator geometry already converted to source pixels", () => {
    let geometry!: SpineGeometry;
    lineRenderer((g) => (geometry = g)).render({
      width: 40,
      height: 20,
      scale: 0.5,
      settings: { spacingMM: 2, toothWidthMM: 3, originXPct: 25, originYPct: 50, angleDeg: 90 },
      source,
    });

    expect(geometry).toMatchObject({ pixelsPerMM: 2, spacing: 4, targetSegmentLength: 1.5, originX: 10, originY: 10 });
    expect(geometry.angleRad).toBeCloseTo(Math.PI / 2, 10);
    expect(geometry.maxRadius).toBeCloseTo(Math.hypot(30, 10), 10);
  });

  it("is safe to call directly with damaged settings — no NaN reaches the path", () => {
    const path = lineRenderer().render({
      width: 40,
      height: 20,
      scale: 1,
      settings: { spacingMM: "garbage", toothWidthMM: NaN, waveform: "nope" } as never,
      source,
    }).layers[0].d;

    expect(path).toMatch(/^M/);
    expect(path).not.toContain("NaN");
  });

  it("draws nothing without a source to trace", () => {
    expect(lineRenderer().render({ width: 40, height: 20, scale: 1, settings: {} })).toEqual({
      layers: [{ d: "" }],
      warnings: [],
    });
  });

  it("passes on a generator's warnings", () => {
    const renderer = defineToneSpineRenderer({
      id: "test-warn",
      label: "Test warn",
      revision: 1,
      fields: [],
      defaults: { toothWidthMM: 3, amplitudeMM: 1 },
      strands(geometry) {
        geometry.warn("Stopped early.");
        return [];
      },
    });

    expect(renderer.render({ width: 40, height: 20, scale: 1, settings: {}, source }).warnings).toEqual(["Stopped early."]);
  });
});
