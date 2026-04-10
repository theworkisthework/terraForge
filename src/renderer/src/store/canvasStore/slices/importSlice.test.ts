import { describe, it, expect, vi, beforeEach } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createImportSlice } from "./importSlice";
import {
  DEFAULT_HATCH_ANGLE_DEG,
  DEFAULT_HATCH_SPACING_MM,
} from "../../../../../types";

type ImportState = ReturnType<ReturnType<typeof createImportSlice>> & {
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

let pushUndo: ReturnType<typeof vi.fn>;

function makeStore() {
  pushUndo = vi.fn();
  return create<ImportState>()(
    immer((set, get) => ({
      selectedImportId: null,
      selectedPathId: null,
      allImportsSelected: false,
      selectedGroupId: null,
      pageTemplate: null,
      layerGroups: [],
      ...createImportSlice(pushUndo)(set as any, get as any),
    })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

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
    expect(pushUndo).toHaveBeenCalledTimes(1);
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

    expect(pushUndo).toHaveBeenCalledTimes(1);
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

    store
      .getState()
      .loadLayout(
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

    expect(pushUndo).toHaveBeenCalledTimes(1);
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
  });
});
