import { describe, it, expect } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createCanvasHistory, type CanvasHistory } from "../history";
import type { CanvasState, HistoryEntry } from "../types";
import { createUndoRedoSlice } from "./undoRedoSlice";

/** The undo/redo slice over a bare document, with the history that drives it. */
function makeStore() {
  let history!: CanvasHistory;
  const store = create<CanvasState>()(
    immer((set, get, api) => {
      history = createCanvasHistory(set, get);
      return {
        imports: [],
        layerGroups: [],
        pageTemplate: null,
        selectedImportId: null,
        selectedPathId: null,
        selectedGroupId: null,
        allImportsSelected: false,
        ...createUndoRedoSlice(history)(set, get, api),
      } as unknown as CanvasState;
    }),
  );
  return { store, history };
}

const imp = (id: string, x = 0) => ({ id, x, y: 0, scale: 1, rotation: 0, paths: [] }) as any;

const entry = (imports: unknown[], rest: Partial<HistoryEntry> = {}): HistoryEntry => ({
  imports: imports as HistoryEntry["imports"],
  layerGroups: [],
  pageTemplate: null,
  revision: 0,
  ...rest,
});

describe("undoRedoSlice", () => {
  it("undo is no-op when stack is empty", () => {
    const { store } = makeStore();
    store.setState({ imports: [imp("i1")] });

    store.getState().undo();

    expect(store.getState().imports).toHaveLength(1);
    expect(store.getState().redoStack).toHaveLength(0);
  });

  it("undo restores the previous document and pushes the current one to redo", () => {
    const { store } = makeStore();
    store.setState({
      imports: [imp("current", 5)],
      undoStack: [entry([imp("prev", 1)])],
      selectedImportId: "x",
      selectedPathId: "p",
      allImportsSelected: true,
    });

    store.getState().undo();

    expect(store.getState().imports[0].id).toBe("prev");
    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().redoStack).toHaveLength(1);
    expect(store.getState().redoStack[0].imports[0].id).toBe("current");
    expect(store.getState().selectedImportId).toBeNull();
    expect(store.getState().selectedPathId).toBeNull();
  });

  it("undo and redo restore layer groups and the page template with the imports", () => {
    const { store } = makeStore();
    const group = { id: "g1", name: "Pen 1", color: "#111111", importIds: ["i1"] };
    const page = { sizeId: "a4", landscape: true, marginMM: 20 };
    store.setState({
      undoStack: [entry([imp("i1")], { layerGroups: [group], pageTemplate: page, revision: 4 })],
      revision: 9,
      selectedGroupId: "g1",
    });

    store.getState().undo();

    expect(store.getState().layerGroups).toEqual([group]);
    expect(store.getState().pageTemplate).toEqual(page);
    expect(store.getState().revision).toBe(4);
    expect(store.getState().selectedGroupId).toBe("g1");

    store.getState().redo();

    expect(store.getState().imports).toEqual([]);
    expect(store.getState().layerGroups).toEqual([]);
    expect(store.getState().pageTemplate).toBeNull();
    expect(store.getState().revision).toBe(9);
    // The selected group went with the document it belonged to.
    expect(store.getState().selectedGroupId).toBeNull();
  });

  it.each(["undo", "redo"] as const)(
    "%s keeps the selection when the selected import still exists (#139)",
    (action) => {
      const { store } = makeStore();
      const moved = imp("i1", 10);
      const orig = imp("i1", 0);
      store.setState({
        imports: action === "undo" ? [moved] : [orig],
        undoStack: action === "undo" ? [entry([orig])] : [],
        redoStack: action === "redo" ? [entry([moved])] : [],
        selectedImportId: "i1",
        allImportsSelected: true,
      });

      store.getState()[action]();

      expect(store.getState().imports[0].x).toBe(action === "undo" ? 0 : 10);
      expect(store.getState().selectedImportId).toBe("i1");
      expect(store.getState().allImportsSelected).toBe(true);
    },
  );

  it("undo drops the selected path if it no longer exists", () => {
    const { store } = makeStore();
    store.setState({
      imports: [{ id: "i1", paths: [{ id: "p2" }] }] as any,
      undoStack: [entry([{ id: "i1", paths: [{ id: "p1" }] }])],
      selectedImportId: "i1",
      selectedPathId: "p2",
    });

    store.getState().undo();

    expect(store.getState().selectedImportId).toBe("i1");
    expect(store.getState().selectedPathId).toBeNull();
  });

  it("redo restores the next document and pushes the current one to undo", () => {
    const { store } = makeStore();
    store.setState({
      imports: [imp("current", 1)],
      redoStack: [entry([imp("next", 9)])],
    });

    store.getState().redo();

    expect(store.getState().imports[0].id).toBe("next");
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0].imports[0].id).toBe("current");
  });

  it("snapshotForGesture leaves the redo stack alone", () => {
    const { store } = makeStore();
    store.setState({
      imports: [imp("i1")],
      redoStack: [entry([imp("later", 1)])],
    });

    store.getState().snapshotForGesture();
    store.getState().commitGesture();

    expect(store.getState().redoStack).toHaveLength(1);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("commitGesture records a step only when the gesture changed the document", () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("i1")] });
    store.getState().snapshotForGesture();

    // a click that moved nothing
    store.getState().commitGesture();
    expect(store.getState().undoStack).toHaveLength(0);

    store.getState().snapshotForGesture();
    history.edit((state) => {
      state.imports[0].x = 5;
    });
    history.edit((state) => {
      state.imports[0].x = 10;
    });
    store.getState().commitGesture();

    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0].imports[0].x).toBe(0);
  });

  it("keeps a gesture's snapshot as it was when the imports are edited in place afterwards", () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("i1")] });
    store.getState().snapshotForGesture();
    history.edit((state) => {
      state.imports[0].x = 10;
    });
    store.getState().commitGesture();

    expect(store.getState().undoStack[0].imports[0].x).toBe(0);
    store.getState().undo();
    expect(store.getState().imports[0].x).toBe(0);
    store.getState().redo();
    expect(store.getState().imports[0].x).toBe(10);
  });

  it("undo in the middle of a gesture records the gesture first, then reverses it", () => {
    const { store, history } = makeStore();
    store.setState({ imports: [imp("i1")] });
    store.getState().snapshotForGesture();
    history.edit((state) => {
      state.imports[0].x = 10;
    });

    store.getState().undo();

    expect(store.getState().imports[0].x).toBe(0);
    expect(store.getState().redoStack).toHaveLength(1);
  });

  it("markSaved makes the current revision the saved one", () => {
    const { store, history } = makeStore();
    history.edit((state) => {
      state.imports.push(imp("i1"));
    });
    expect(store.getState().revision).not.toBe(store.getState().savedRevision);

    store.getState().markSaved();

    expect(store.getState().savedRevision).toBe(store.getState().revision);
  });
});
