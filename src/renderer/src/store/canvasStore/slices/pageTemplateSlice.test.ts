import { describe, it, expect } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { BUILT_IN_PAGE_SIZES } from "../../../../../types";
import { createPageTemplateSlice } from "./pageTemplateSlice";

type PageTemplateState = ReturnType<typeof createPageTemplateSlice>;

function makeStore() {
  return create<PageTemplateState>()(
    immer((set, get) => ({
      ...createPageTemplateSlice(set as any, get as any),
    })),
  );
}

describe("pageTemplateSlice", () => {
  it("starts with null page template and built-in page sizes", () => {
    const store = makeStore();
    const state = store.getState();

    expect(state.pageTemplate).toBeNull();
    expect(state.pageSizes).toEqual(BUILT_IN_PAGE_SIZES);
  });

  it("setPageTemplate updates the active page template", () => {
    const store = makeStore();

    store.getState().setPageTemplate({
      sizeId: "a4",
      landscape: true,
      marginMM: 20,
    });

    expect(store.getState().pageTemplate).toEqual({
      sizeId: "a4",
      landscape: true,
      marginMM: 20,
    });
  });

  it("setPageTemplate accepts null to clear the template", () => {
    const store = makeStore();
    store.getState().setPageTemplate({
      sizeId: "letter",
      landscape: false,
      marginMM: 10,
    });

    store.getState().setPageTemplate(null);

    expect(store.getState().pageTemplate).toBeNull();
  });

  it("setPageSizes replaces available sizes", () => {
    const store = makeStore();
    const customSizes = [
      { id: "poster", name: "Poster", widthMM: 500, heightMM: 700 },
      { id: "mini", name: "Mini", widthMM: 120, heightMM: 80 },
    ];

    store.getState().setPageSizes(customSizes);

    expect(store.getState().pageSizes).toEqual(customSizes);
  });
});
