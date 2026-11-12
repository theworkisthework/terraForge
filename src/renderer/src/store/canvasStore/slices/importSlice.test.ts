import { describe, it, expect } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createCanvasHistory } from "../history";
import { createImportSlice } from "./importSlice";
import { createUndoRedoSlice } from "./undoRedoSlice";
import {
  DEFAULT_HATCH_ANGLE_DEG,
  DEFAULT_HATCH_SPACING_MM,
} from "../../../../../types";

type ImportState = ReturnType<ReturnType<typeof createImportSlice>> &
  ReturnType<ReturnType<typeof createUndoRedoSlice>> & {
  selectedImportId: string | null;
  selectedPathId: string | null;
  allImportsSelected: boolean;
  selectedGroupId: string | null;
  pageTemplate: { sizeId: string; landscape: boolean; marginMM: number } | null;
  layerGroups: Array<{
    id: string;
    name: string;
    color: string;
    importIds: string[];
  }>;
};

function makeStore() {
  return create<ImportState>()(
    immer((set, get, store) => {
      const history = createCanvasHistory(set as any, get as any);
      return {
        selectedImportId: null,
        selectedPathId: null,
        allImportsSelected: false,
        selectedGroupId: null,
        pageTemplate: null,
        layerGroups: [],
        ...createUndoRedoSlice(history)(set as any, get as any, store as any),
        ...createImportSlice(history)(set as any, get as any, store as any),
      };
    }),
  );
}

const bareImport = (id: string, rest: object = {}) =>
  ({
    id,
    name: id,
    paths: [],
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    svgWidth: 1,
    svgHeight: 1,
    viewBoxX: 0,
    viewBoxY: 0,
    ...rest,
  }) as any;

/** Edits in one turn of the event loop are one undo step; this ends the turn. */
const nextTurn = () => Promise.resolve();

describe("importSlice", () => {
  it("addImport applies default hatch settings and pushes undo", () => {
    const store = makeStore();

    store.getState().addImport({
      id: "imp1",
      name: "shape",
      paths: [{ id: "p1", d: "M0 0", svgSource: "", visible: true }],
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      visible: true,
      svgWidth: 10,
      svgHeight: 10,
      viewBoxX: 0,
      viewBoxY: 0,
    } as any);

    const imp = store.getState().imports[0];
    expect(store.getState().undoStack).toHaveLength(1);
    expect(imp.hatchEnabled).toBe(false);
    expect(imp.hatchSpacingMM).toBe(DEFAULT_HATCH_SPACING_MM);
    expect(imp.hatchAngleDeg).toBe(DEFAULT_HATCH_ANGLE_DEG);
  });

  it("removeImport updates selection state and all-selected fallback", () => {
    const store = makeStore();
    store.setState({
      imports: [
        {
          id: "a",
          name: "a",
          paths: [],
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
          svgWidth: 1,
          svgHeight: 1,
          viewBoxX: 0,
          viewBoxY: 0,
        },
        {
          id: "b",
          name: "b",
          paths: [],
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
          svgWidth: 1,
          svgHeight: 1,
          viewBoxX: 0,
          viewBoxY: 0,
        },
      ] as any,
      allImportsSelected: true,
    });

    store.getState().removeImport("b");

    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().imports).toHaveLength(1);
    expect(store.getState().allImportsSelected).toBe(false);
    expect(store.getState().selectedImportId).toBe("a");
  });

  it("loadLayout replaces imports and clears selection/group state", () => {
    const store = makeStore();
    store.setState({
      selectedImportId: "old",
      selectedPathId: "path",
      allImportsSelected: true,
      selectedGroupId: "group",
      layerGroups: [
        { id: "oldg", name: "old", color: "#111", importIds: ["old"] },
      ],
      pageTemplate: { sizeId: "a4", landscape: true, marginMM: 20 },
    });

    store.getState().loadLayout(
      [
        {
          id: "new",
          name: "new",
          paths: [],
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
          svgWidth: 1,
          svgHeight: 1,
          viewBoxX: 0,
          viewBoxY: 0,
        },
      ] as any,
      [{ id: "g1", name: "group", color: "#222", importIds: ["new"] }],
      { sizeId: "letter", landscape: false, marginMM: 10 },
    );

    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().imports[0].id).toBe("new");
    expect(store.getState().selectedImportId).toBeNull();
    expect(store.getState().selectedPathId).toBeNull();
    expect(store.getState().allImportsSelected).toBe(false);
    expect(store.getState().selectedGroupId).toBeNull();
    expect(store.getState().layerGroups[0].id).toBe("g1");
    expect(store.getState().pageTemplate?.sizeId).toBe("letter");
  });

  it("updatePath and updateImportLayer are no-ops for missing targets", () => {
    const store = makeStore();
    store.setState({
      imports: [
        {
          id: "imp1",
          name: "shape",
          paths: [{ id: "p1", d: "M0 0", svgSource: "", visible: true }],
          layers: [{ id: "l1", name: "layer", visible: true }],
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
          svgWidth: 1,
          svgHeight: 1,
          viewBoxX: 0,
          viewBoxY: 0,
        },
      ] as any,
    });

    store.getState().updatePath("missing", "p1", { visible: false });
    store.getState().updateImportLayer("imp1", "missing", false);

    expect(store.getState().imports[0].paths[0].visible).toBe(true);
    expect(store.getState().imports[0].layers?.[0].visible).toBe(true);
    // Nothing changed, so there is nothing to undo and nothing to save.
    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().revision).toBe(store.getState().savedRevision);
  });

  it("normalizes legacy no-stroke paths to inherit import generated-stroke toggle", () => {
    const store = makeStore();

    store.getState().addImport({
      id: "imp1",
      name: "shape",
      paths: [
        {
          id: "p1",
          d: "M0 0",
          svgSource: "",
          visible: true,
          outlineVisible: false,
          sourceOutlineVisible: false,
          generatedStrokeEnabled: false,
        },
      ],
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      visible: true,
      svgWidth: 10,
      svgHeight: 10,
      viewBoxX: 0,
      viewBoxY: 0,
      generatedStrokeForNoStroke: true,
    } as any);

    const imp = store.getState().imports[0];
    expect(imp.generatedStrokeForNoStroke).toBe(true);
    expect(imp.paths[0].generatedStrokeEnabled).toBeUndefined();
  });
});

describe("importSlice removePath", () => {
  it("removePath refits the bounding box to the remaining paths", () => {
    const store = makeStore();
    store.getState().addImport({
      id: "imp1",
      name: "page with art",
      paths: [
        { id: "page", d: "M0 0 H100 V200 H0 Z", svgSource: "", visible: true },
        { id: "art", d: "M60 20 H70 V30 H60 Z", svgSource: "", visible: true },
      ],
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      visible: true,
      svgWidth: 100,
      svgHeight: 200,
      viewBoxX: 0,
      viewBoxY: 0,
    });

    store.getState().removePath("imp1", "page");

    expect(store.getState().imports[0]).toMatchObject({
      x: 60,
      y: 170,
      svgWidth: 10,
      svgHeight: 10,
      viewBoxX: 60,
      viewBoxY: 20,
    });
  });
});

describe("importSlice and layer groups", () => {
  const group = (importIds: string[]) => ({ id: "g1", name: "Pen 1", color: "#111111", importIds });

  it("removeImport takes the import out of its layer group, and undo puts it back", () => {
    const store = makeStore();
    store.setState({ imports: [bareImport("a"), bareImport("b")], layerGroups: [group(["a", "b"])] });

    store.getState().removeImport("a");
    expect(store.getState().layerGroups[0].importIds).toEqual(["b"]);

    store.getState().undo();
    expect(store.getState().imports.map((imp) => imp.id)).toEqual(["a", "b"]);
    expect(store.getState().layerGroups[0].importIds).toEqual(["a", "b"]);
  });

  it("undoing clearImports restores the layer groups too", () => {
    const store = makeStore();
    store.setState({ imports: [bareImport("a")], layerGroups: [group(["a"])] });

    store.getState().clearImports();
    expect(store.getState().layerGroups).toEqual([]);

    store.getState().undo();
    expect(store.getState().imports).toHaveLength(1);
    expect(store.getState().layerGroups).toEqual([group(["a"])]);
  });

  it("undoing loadLayout restores the previous imports, layer groups and page", () => {
    const store = makeStore();
    const page = { sizeId: "a4", landscape: true, marginMM: 20 };
    store.setState({ imports: [bareImport("old")], layerGroups: [group(["old"])], pageTemplate: page });

    store.getState().loadLayout([bareImport("new")], [], { sizeId: "letter", landscape: false, marginMM: 10 });
    store.getState().undo();

    expect(store.getState().imports.map((imp) => imp.id)).toEqual(["old"]);
    expect(store.getState().layerGroups).toEqual([group(["old"])]);
    expect(store.getState().pageTemplate).toEqual(page);
  });
});

describe("importSlice undo of property edits", () => {
  const withPath = () => {
    const store = makeStore();
    store.setState({
      imports: [
        bareImport("a", {
          paths: [{ id: "p1", d: "M0 0 H10", svgSource: "", visible: true }],
          layers: [{ id: "l1", name: "layer", visible: true }],
        }),
      ],
    });
    return store;
  };

  it("undoes an import property edit", () => {
    const store = withPath();
    store.getState().updateImport("a", { strokeWidthMM: 0.8 });
    store.getState().undo();
    expect(store.getState().imports[0].strokeWidthMM).toBeUndefined();
    store.getState().redo();
    expect(store.getState().imports[0].strokeWidthMM).toBe(0.8);
  });

  it("undoes a path edit, a layer visibility change and a path removal, one at a time", async () => {
    const store = withPath();
    store.getState().updatePath("a", "p1", { visible: false });
    await nextTurn();
    store.getState().updateImportLayer("a", "l1", false);
    await nextTurn();
    store.getState().removePath("a", "p1");
    expect(store.getState().undoStack).toHaveLength(3);

    store.getState().undo();
    expect(store.getState().imports[0].paths).toHaveLength(1);
    expect(store.getState().imports[0].layers?.[0].visible).toBe(false);
    store.getState().undo();
    expect(store.getState().imports[0].layers?.[0].visible).toBe(true);
    expect(store.getState().imports[0].paths[0].visible).toBe(false);
    store.getState().undo();
    expect(store.getState().imports[0].paths[0].visible).toBe(true);
  });

  it("undoes turning hatching on", () => {
    const store = withPath();
    store.getState().applyHatch("a", 2, 45, true);
    expect(store.getState().imports[0].hatchEnabled).toBe(true);
    store.getState().undo();
    expect(store.getState().imports[0].hatchEnabled).toBeFalsy();
  });

  it("applyRenderResult changes the import without an undo step or unsaved changes", () => {
    const store = withPath();
    store.getState().applyRenderResult("a", { svgWidth: 40 });
    expect(store.getState().imports[0].svgWidth).toBe(40);
    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().revision).toBe(store.getState().savedRevision);
  });

  it("loadLayout leaves the document saved; an edit after it does not", async () => {
    const store = makeStore();
    store.getState().loadLayout([bareImport("a")]);
    expect(store.getState().revision).toBe(store.getState().savedRevision);

    store.getState().updateImport("a", { x: 5 });
    expect(store.getState().revision).not.toBe(store.getState().savedRevision);

    // Undoing back to what was loaded is back to what is saved.
    store.getState().undo();
    expect(store.getState().revision).toBe(store.getState().savedRevision);
  });
});
