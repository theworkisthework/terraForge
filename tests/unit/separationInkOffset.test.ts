import { describe, expect, it } from "vitest";
import { bitmapRenderers } from "@renderer/features/bitmap-renderers/registry";
import { bitmapRendererStamp, bitmapRenderSignature } from "@renderer/features/bitmap-renderers/bitmapImage";
import type { RendererContext, RendererInk, RendererOutput, RendererResult } from "../../src/types";

const W = 120;
const H = 90;
const source = { width: W, height: H, values: new Uint8Array(W * H).map((_, i) => (i * 13) % 256) };

const ink = (index: number, count = 4, offset = true): RendererInk => ({
  index,
  count,
  label: `Ink ${index}`,
  color: "#000000",
  offset,
});

/** Everything a render drew, as one comparable string. */
function drawn(output: RendererOutput): string {
  if (typeof output === "string") return output;
  const layers = Array.isArray(output) ? output : (output as RendererResult).layers;
  return layers.map((layer) => `${layer.d ?? ""}|${(layer.dots ?? []).map((dot) => dot.d).join(" ")}`).join("\n");
}

function render(rendererId: string, inkInfo?: RendererInk, settings = {}): string {
  const renderer = bitmapRenderers.find((r) => r.id === rendererId)!;
  const context: RendererContext = {
    width: W,
    height: H,
    scale: 0.5,
    settings: { ...renderer.defaults, ...settings },
    source,
    ink: inkInfo,
  };
  return drawn(renderer.render(context) as RendererOutput);
}

describe("offsetting separated inks", () => {
  for (const { id } of bitmapRenderers) {
    describe(id, () => {
      it("leaves the first ink exactly where an unseparated render puts it", () => {
        expect(render(id, ink(0))).toBe(render(id));
      });

      it("moves every other ink, each to a different place", () => {
        const drawings = [0, 1, 2, 3].map((index) => render(id, ink(index)));
        expect(new Set(drawings).size).toBe(4);
      });

      it("stacks every ink on one pattern when offsetting is off", () => {
        expect(render(id, ink(2, 4, false))).toBe(render(id));
      });
    });
  }

  it("interleaves rings by a fraction of the spacing", () => {
    // Straight rings (no amplitude), 1px = 0.5mm; spacing 4mm = 8px.
    const radii = (index: number) =>
      render("circular-rings", ink(index, 2), { amplitudeMM: 0 })
        .split(/(?=M)/)
        .map((sub) => {
          const [x, y] = (sub.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
          return Math.hypot(x - W / 2, y - H / 2);
        })
        .filter((r) => r < 40)
        .sort((a, b) => a - b);
    const [first0] = radii(0);
    const [first1] = radii(1);
    expect(first1 - first0).toBeCloseTo(4, 0); // half of an 8px spacing
  });
});

describe("render stamps and signatures for separation", () => {
  const spiral = bitmapRenderers.find((r) => r.id === "spiral-amplitude")!;

  it("marks only separated output as made before inks were offset", () => {
    expect(bitmapRendererStamp(spiral, "cmyk")).not.toBe(bitmapRendererStamp(spiral, "none"));
    expect(bitmapRendererStamp(spiral)).toBe(bitmapRendererStamp(spiral, "none"));
  });

  it("marks only the unmixed modes as made before ink unmixing", () => {
    expect(bitmapRendererStamp(spiral, "custom")).toBe(bitmapRendererStamp(spiral, "rgb-white"));
    expect(bitmapRendererStamp(spiral, "custom")).not.toBe(bitmapRendererStamp(spiral, "cmyk"));
    // CMY, CMYK and light-on-dark RGB are unchanged, so not offered a re-render.
    expect(bitmapRendererStamp(spiral, "cmyk")).toBe(bitmapRendererStamp(spiral, "cmy"));
    expect(bitmapRendererStamp(spiral, "rgb")).toBe(bitmapRendererStamp(spiral, "cmy"));
  });

  it("keeps a drawing's signature until the offset setting is first changed", () => {
    const imp = { id: "b", bitmapDataUrl: "data:x", bitmapRendererId: "spiral-amplitude", bitmapSeparationMode: "cmyk" as const };
    expect(bitmapRenderSignature({ ...imp, bitmapSeparationOffset: undefined })).toBe(bitmapRenderSignature(imp));
    expect(bitmapRenderSignature({ ...imp, bitmapSeparationOffset: false })).not.toBe(bitmapRenderSignature(imp));
  });
});
