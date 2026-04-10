import { describe, it, expect, vi, beforeEach } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createClipboardSlice } from "./clipboardSlice";

type ClipState = ReturnType<ReturnType<typeof createClipboardSlice>> & {
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
};

let pushUndo: ReturnType<typeof vi.fn>;

function makeStore() {
  pushUndo = vi.fn();
  return create<ClipState>()(
    immer((set, get) => ({
      imports: [],
      selectedImportId: null,
      selectedPathId: null,
      toolpathSelected: false,
      allImportsSelected: false,
      selectedGroupId: null,
      ...createClipboardSlice(pushUndo)(set as any, get as any),
    })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

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

    expect(pushUndo).toHaveBeenCalledTimes(1);
    expect(store.getState().clipboardImport?.id).toBe("i1");
    expect(store.getState().imports).toHaveLength(0);
    expect(store.getState().selectedImportId).toBeNull();
    expect(store.getState().selectedPathId).toBeNull();
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

    expect(pushUndo).toHaveBeenCalledTimes(1);
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

    expect(pushUndo).not.toHaveBeenCalled();
    expect(store.getState().imports).toHaveLength(1);
    expect(store.getState().clipboardImport).toBeNull();
  });
});
