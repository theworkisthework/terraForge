import { afterEach, describe, it, expect, vi } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { BUILT_IN_PAGE_SIZES } from "../../../../../types";
import { COALESCE_WINDOW_MS, createCanvasHistory } from "../history";
import { createPageTemplateSlice } from "./pageTemplateSlice";
import { createUndoRedoSlice } from "./undoRedoSlice";

type PageTemplateState = ReturnType<ReturnType<typeof createPageTemplateSlice>> &
  ReturnType<ReturnType<typeof createUndoRedoSlice>> & {
    imports: [];
    layerGroups: [];
    selectedImportId: null;
    selectedGroupId: null;
  };

function makeStore() {
  return create<PageTemplateState>()(
    immer((set, get, store) => {
      const history = createCanvasHistory(set as any, get as any);
      return {
        imports: [],
        layerGroups: [],
        selectedImportId: null,
        selectedGroupId: null,
        ...createUndoRedoSlice(history)(set as any, get as any, store as any),
        ...createPageTemplateSlice(history)(set as any, get as any, store as any),
      };
    }),
  );
}

/** Edits in one turn of the event loop are one undo step; this ends the turn. */
const nextTurn = () => Promise.resolve();

afterEach(() => {
  vi.useRealTimers();
});

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

  describe("undo", () => {
    const a4 = { sizeId: "a4", landscape: false, marginMM: 20 };

    it("undoes choosing, turning and removing the page, one step at a time", async () => {
      const store = makeStore();
      store.getState().setPageTemplate(a4);
      await nextTurn();
      store.getState().setPageTemplate({ ...a4, landscape: true });
      await nextTurn();
      store.getState().setPageTemplate(null);
      expect(store.getState().undoStack).toHaveLength(3);

      store.getState().undo();
      expect(store.getState().pageTemplate).toEqual({ ...a4, landscape: true });
      store.getState().undo();
      expect(store.getState().pageTemplate).toEqual(a4);
      store.getState().undo();
      expect(store.getState().pageTemplate).toBeNull();
    });

    it("records nothing when the same page is set again", () => {
      const store = makeStore();
      store.setState({ pageTemplate: a4 });

      store.getState().setPageTemplate({ ...a4 });

      expect(store.getState().undoStack).toHaveLength(0);
      expect(store.getState().pageTemplate).toBe(a4);
    });

    it("makes one step of a margin typed digit by digit, and another once the typing has paused", async () => {
      vi.useFakeTimers();
      const store = makeStore();
      store.setState({ pageTemplate: a4 });

      for (const marginMM of [1, 12, 125]) {
        store.getState().setPageTemplate({ ...a4, marginMM });
        await nextTurn();
        vi.advanceTimersByTime(200);
      }
      expect(store.getState().undoStack).toHaveLength(1);

      vi.advanceTimersByTime(COALESCE_WINDOW_MS + 1);
      store.getState().setPageTemplate({ ...a4, marginMM: 30 });
      expect(store.getState().undoStack).toHaveLength(2);

      store.getState().undo();
      expect(store.getState().pageTemplate?.marginMM).toBe(125);
      store.getState().undo();
      expect(store.getState().pageTemplate?.marginMM).toBe(20);
    });

    it("keeps a margin edit and a colour edit as separate steps", async () => {
      const store = makeStore();
      store.setState({ pageTemplate: a4 });

      store.getState().setPageTemplate({ ...a4, marginMM: 10 });
      await nextTurn();
      store.getState().setPageTemplate({ ...a4, marginMM: 10, paperColor: "#ffeecc" });

      expect(store.getState().undoStack).toHaveLength(2);
    });
  });
});
