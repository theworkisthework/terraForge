import { describe, expect, it } from "vitest";
import { computeBitmapFitScale, resolvePageBounds } from "./pageBounds";

const NATIVE_SCALE = 25.4 / 96;

describe("resolvePageBounds", () => {
  it("falls back to bed dimensions when no page template is active", () => {
    const result = resolvePageBounds({
      bedW: 220,
      bedH: 200,
      pageTemplate: null,
      pageSizes: [],
    });

    expect(result.pageW).toBe(220);
    expect(result.pageH).toBe(200);
    expect(result.canAlignToTemplate).toBe(false);
    expect(result.marginMM).toBe(20);
  });

  it("uses portrait size dimensions when template is portrait", () => {
    const result = resolvePageBounds({
      bedW: 220,
      bedH: 200,
      pageTemplate: {
        sizeId: "a4",
        landscape: false,
        marginMM: 12,
      },
      pageSizes: [{ id: "a4", name: "A4", widthMM: 210, heightMM: 297 }],
    });

    expect(result.pageW).toBe(210);
    expect(result.pageH).toBe(297);
    expect(result.canAlignToTemplate).toBe(true);
    expect(result.marginMM).toBe(12);
  });

  it("swaps dimensions when template is landscape", () => {
    const result = resolvePageBounds({
      bedW: 220,
      bedH: 200,
      pageTemplate: {
        sizeId: "a4",
        landscape: true,
        marginMM: 12,
      },
      pageSizes: [{ id: "a4", name: "A4", widthMM: 210, heightMM: 297 }],
    });

    expect(result.pageW).toBe(297);
    expect(result.pageH).toBe(210);
    expect(result.canAlignToTemplate).toBe(true);
    expect(result.marginMM).toBe(12);
  });

  it("disables template alignment when the selected size is missing", () => {
    const result = resolvePageBounds({
      bedW: 220,
      bedH: 200,
      pageTemplate: {
        sizeId: "missing",
        landscape: false,
        marginMM: 8,
      },
      pageSizes: [{ id: "a4", name: "A4", widthMM: 210, heightMM: 297 }],
    });

    expect(result.pageW).toBe(220);
    expect(result.pageH).toBe(200);
    expect(result.canAlignToTemplate).toBe(false);
    expect(result.marginMM).toBe(8);
  });
});

describe("computeBitmapFitScale", () => {
  it("leaves a small image at native 96 DPI rather than upscaling it to fill the bed", () => {
    const scale = computeBitmapFitScale({
      naturalWidth: 400,
      naturalHeight: 300,
      bedW: 220,
      bedH: 200,
      pageTemplate: null,
      pageSizes: [],
    });

    expect(scale).toBe(NATIVE_SCALE);
  });

  it("caps an oversized image down to fit the bed when no page template is active", () => {
    // At native scale this 6000x4000px photo would be ~1587x1058mm.
    const scale = computeBitmapFitScale({
      naturalWidth: 6000,
      naturalHeight: 4000,
      bedW: 220,
      bedH: 200,
      pageTemplate: null,
      pageSizes: [],
    });

    expect(scale).toBeLessThan(NATIVE_SCALE);
    expect(scale * 6000).toBeLessThanOrEqual(220 + 1e-9);
    expect(scale * 4000).toBeLessThanOrEqual(200 + 1e-9);
  });

  it("caps an oversized image to fit within the page's margin-inset area when a template is active", () => {
    const scale = computeBitmapFitScale({
      naturalWidth: 6000,
      naturalHeight: 4000,
      bedW: 1000,
      bedH: 1000,
      pageTemplate: { sizeId: "a4", landscape: false, marginMM: 12 },
      pageSizes: [{ id: "a4", name: "A4", widthMM: 210, heightMM: 297 }],
    });

    const usableW = 210 - 2 * 12;
    const usableH = 297 - 2 * 12;
    expect(scale * 6000).toBeLessThanOrEqual(usableW + 1e-9);
    expect(scale * 4000).toBeLessThanOrEqual(usableH + 1e-9);
    // The bed is huge here, so the page's margin area is the binding
    // constraint, not the bed itself.
    expect(scale).toBeLessThan(1000 / 6000);
  });

  it("does not divide by zero for a degenerate natural size", () => {
    expect(
      computeBitmapFitScale({
        naturalWidth: 0,
        naturalHeight: 0,
        bedW: 220,
        bedH: 200,
        pageTemplate: null,
        pageSizes: [],
      }),
    ).toBe(NATIVE_SCALE);
  });
});
