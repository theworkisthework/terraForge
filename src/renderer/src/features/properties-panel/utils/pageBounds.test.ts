import { describe, expect, it } from "vitest";
import { resolvePageBounds } from "./pageBounds";

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
