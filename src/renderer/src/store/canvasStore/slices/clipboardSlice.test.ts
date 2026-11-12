import { describe, it, expect } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createCanvasHistory } from "../history";
import { createClipboardSlice } from "./clipboardSlice";
import { createUndoRedoSlice } from "./undoRedoSlice";

type ClipState = ReturnType<ReturnType<typeof createClipboardSlice>> &
  ReturnType<ReturnType<typeof createUndoRedoSlice>> & {
  imports: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    paths: Array<{ id: string }>;
  }>;
  selectedImportId: string | null;
  selectedPathId: string | null;
  toolpathSelected: boolean;
  allImportsSelected: boolean;
  selectedGroupId: string | null;
  layerGroups: Array<{ id: string; name: string; color: string; importIds: string[] }>;
  pageTemplate: null;
};

function makeStore() {
  return create<ClipState>()(
    immer((set, get, store) => {
      const history = createCanvasHistory(set as any, get as any);
      return {
        imports: [],
        selectedImportId: null,
        selectedPathId: null,
        toolpathSelected: false,
        allImportsSelected: false,
        selectedGroupId: null,
        layerGroups: [],
        pageTemplate: null,
        ...createUndoRedoSlice(history)(set as any, get as any, store as any),
        ...createClipboardSlice(history)(set as any, get as any, store as any),
      };
    }),
  );
}

describe("clipboardSlice", () => {
  it("copies an import into clipboard without mutating imports", () => {
    const store = makeStore();
    store.setState({
      imports: [{ id: "i1", name: "shape", x: 0, y: 0, paths: [{ id: "p1" }] }],
    });

    store.getState().copyImport("i1");

    expect(store.getState().clipboardImport?.id).toBe("i1");
    expect(store.getState().imports).toHaveLength(1);
  });

  it("cutImport snapshots, pushes undo, and removes selected import", () => {
    const store = makeStore();
    store.setState({
      imports: [{ id: "i1", name: "shape", x: 0, y: 0, paths: [{ id: "p1" }] }],
      selectedImportId: "i1",
      selectedPathId: "p1",
    });

    store.getState().cutImport("i1");

    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().clipboardImport?.id).toBe("i1");
    expect(store.getState().imports).toHaveLength(0);
    expect(store.getState().selectedImportId).toBeNull();
    expect(store.getState().selectedPathId).toBeNull();
  });

  it("cutImport takes the import out of its layer group, and undo puts it back", () => {
    const store = makeStore();
    store.setState({
      imports: [{ id: "i1", name: "shape", x: 0, y: 0, paths: [{ id: "p1" }] }],
      layerGroups: [{ id: "g1", name: "Pen 1", color: "#111111", importIds: ["i1"] }],
    });

    store.getState().cutImport("i1");
    expect(store.getState().layerGroups[0].importIds).toEqual([]);

    store.getState().undo();
    expect(store.getState().imports).toHaveLength(1);
    expect(store.getState().layerGroups[0].importIds).toEqual(["i1"]);
  });

  it("pasteImport adds a renamed offset copy with new ids", () => {
    const store = makeStore();
    store.setState({
      imports: [
        { id: "base", name: "shape", x: 10, y: 20, paths: [{ id: "p0" }] },
      ],
      clipboardImport: {
        id: "src",
        name: "shape",
        x: 10,
        y: 20,
        paths: [{ id: "p1" }],
      } as any,
      toolpathSelected: true,
    });

    store.getState().pasteImport();
    const state = store.getState();
    const pasted = state.imports[1];

    expect(state.undoStack).toHaveLength(1);
    expect(state.imports).toHaveLength(2);
    expect(pasted.name).toBe("shape copy");
    expect(pasted.id).not.toBe("src");
    expect(pasted.paths[0].id).not.toBe("p1");
    expect(pasted.x).toBe(15);
    expect(pasted.y).toBe(25);
    expect(state.selectedImportId).toBe(pasted.id);
    expect(state.selectedPathId).toBeNull();
    expect(state.toolpathSelected).toBe(false);
  });

  it("selectAllImports cycles between all-selected and first-item-selected", () => {
    const store = makeStore();
    store.setState({
      imports: [
        { id: "i1", name: "one", x: 0, y: 0, paths: [{ id: "p1" }] },
        { id: "i2", name: "two", x: 0, y: 0, paths: [{ id: "p2" }] },
      ],
      selectedGroupId: "g1",
      selectedPathId: "p1",
      toolpathSelected: true,
    });

    store.getState().selectAllImports();
    expect(store.getState().allImportsSelected).toBe(true);
    expect(store.getState().selectedImportId).toBeNull();
    expect(store.getState().selectedGroupId).toBeNull();
    expect(store.getState().selectedPathId).toBeNull();
    expect(store.getState().toolpathSelected).toBe(false);

    store.getState().selectAllImports();
    expect(store.getState().allImportsSelected).toBe(false);
    expect(store.getState().selectedImportId).toBe("i1");
  });

  it("is no-op for unknown copy/cut ids and empty paste", () => {
    const store = makeStore();
    store.setState({
      imports: [{ id: "i1", name: "one", x: 0, y: 0, paths: [{ id: "p1" }] }],
      clipboardImport: null,
    });

    store.getState().copyImport("missing");
    store.getState().cutImport("missing");
    store.getState().pasteImport();

    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().imports).toHaveLength(1);
    expect(store.getState().clipboardImport).toBeNull();
  });
});
