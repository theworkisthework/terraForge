import { describe, it, expect } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createUndoRedoSlice } from "./undoRedoSlice";

type HistState = ReturnType<typeof createUndoRedoSlice> & {
  imports: Array<{
    id: string;
    x: number;
    y: number;
    scale: number;
    rotation: number;
  }>;
  selectedImportId: string | null;
  selectedPathId: string | null;
  allImportsSelected: boolean;
};

function makeStore() {
  return create<HistState>()(
    immer((set, get) => ({
      imports: [],
      selectedImportId: null,
      selectedPathId: null,
      allImportsSelected: false,
      ...createUndoRedoSlice(set as any, get as any),
    })),
  );
}

describe("undoRedoSlice", () => {
  it("undo is no-op when stack is empty", () => {
    const store = makeStore();
    store.setState({
      imports: [{ id: "i1", x: 0, y: 0, scale: 1, rotation: 0 }] as any,
    });

    store.getState().undo();

    expect(store.getState().imports).toHaveLength(1);
    expect(store.getState().redoStack).toHaveLength(0);
  });

  it("undo restores previous snapshot and pushes current to redo", () => {
    const store = makeStore();
    store.setState({
      imports: [{ id: "current", x: 5, y: 5, scale: 1, rotation: 0 }] as any,
      undoStack: [[{ id: "prev", x: 1, y: 1, scale: 1, rotation: 0 }] as any],
      selectedImportId: "x",
      selectedPathId: "p",
      allImportsSelected: true,
    });

    store.getState().undo();

    expect(store.getState().imports[0].id).toBe("prev");
    expect(store.getState().redoStack).toHaveLength(1);
    expect(store.getState().redoStack[0][0].id).toBe("current");
    expect(store.getState().selectedImportId).toBeNull();
    expect(store.getState().selectedPathId).toBeNull();
    expect(store.getState().allImportsSelected).toBe(false);
  });

  it("redo restores next snapshot and pushes current to undo", () => {
    const store = makeStore();
    store.setState({
      imports: [{ id: "current", x: 1, y: 1, scale: 1, rotation: 0 }] as any,
      redoStack: [[{ id: "next", x: 9, y: 9, scale: 1, rotation: 0 }] as any],
    });

    store.getState().redo();

    expect(store.getState().imports[0].id).toBe("next");
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0][0].id).toBe("current");
  });

  it("snapshotForGesture stores imports and clears redo stack", () => {
    const store = makeStore();
    store.setState({
      imports: [{ id: "i1", x: 0, y: 0, scale: 1, rotation: 0 }] as any,
      redoStack: [[{ id: "stale", x: 1, y: 1, scale: 1, rotation: 0 }] as any],
    });

    store.getState().snapshotForGesture();

    expect(store.getState().redoStack).toHaveLength(0);
  });

  it("commitGesture pushes undo only when tracked values changed", () => {
    const store = makeStore();
    store.setState({
      imports: [{ id: "i1", x: 0, y: 0, scale: 1, rotation: 0 }] as any,
    });
    store.getState().snapshotForGesture();

    // no tracked change
    store.getState().commitGesture();
    expect(store.getState().undoStack).toHaveLength(0);

    store.getState().snapshotForGesture();
    store.setState({
      imports: [{ id: "i1", x: 10, y: 0, scale: 1, rotation: 0 }] as any,
    });
    store.getState().commitGesture();

    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0][0].x).toBe(0);
  });
});
