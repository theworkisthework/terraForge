import { describe, it, expect } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createCanvasHistory } from "../history";
import { createLayerGroupSlice } from "./layerGroupSlice";
import { createUndoRedoSlice } from "./undoRedoSlice";

type LayerGroupState = ReturnType<ReturnType<typeof createLayerGroupSlice>> &
  ReturnType<ReturnType<typeof createUndoRedoSlice>> & {
  imports: Array<{
    id: string;
    name: string;
    visible: boolean;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    svgWidth: number;
    svgHeight: number;
    paths: Array<{
      id: string;
      d: string;
      svgSource: string;
      visible: boolean;
      layer?: string;
      outlineVisible?: boolean;
      hatchLines?: string[];
    }>;
    layers?: Array<{ id: string; name: string; visible: boolean }>;
  }>;
  selectedGroupId: string | null;
  selectedImportId: string | null;
  selectedPathId: string | null;
  allImportsSelected: boolean;
  pageTemplate: null;
};

function makeStore() {
  return create<LayerGroupState>()(
    immer((set, get, store) => {
      const history = createCanvasHistory(set as any, get as any);
      return {
        imports: [],
        selectedGroupId: null,
        selectedImportId: null,
        selectedPathId: null,
        allImportsSelected: false,
        pageTemplate: null,
        ...createUndoRedoSlice(history)(set as any, get as any, store as any),
        ...createLayerGroupSlice(history)(set as any, get as any, store as any),
      };
    }),
  );
}

/** Edits in one turn of the event loop are one undo step; this ends the turn. */
const nextTurn = () => Promise.resolve();

describe("layerGroupSlice", () => {
  it("starts with no groups", () => {
    const store = makeStore();
    expect(store.getState().layerGroups).toEqual([]);
  });

  it("adds and updates groups", () => {
    const store = makeStore();
    store.getState().addLayerGroup("Group A", "#111111");

    const id = store.getState().layerGroups[0].id;
    store
      .getState()
      .updateLayerGroup(id, { name: "Renamed", color: "#222222" });

    expect(store.getState().layerGroups[0]).toMatchObject({
      name: "Renamed",
      color: "#222222",
    });
  });

  it("removeLayerGroup clears selectedGroupId when removing the selected group", () => {
    const store = makeStore();
    store.setState({
      layerGroups: [{ id: "g1", name: "Group", color: "#111", importIds: [] }],
      selectedGroupId: "g1",
    });

    store.getState().removeLayerGroup("g1");

    expect(store.getState().layerGroups).toEqual([]);
    expect(store.getState().selectedGroupId).toBeNull();
  });

  it("assignImportToGroup moves membership between groups", () => {
    const store = makeStore();
    store.setState({
      layerGroups: [
        { id: "g1", name: "One", color: "#111", importIds: ["imp1"] },
        { id: "g2", name: "Two", color: "#222", importIds: [] },
      ],
    });

    store.getState().assignImportToGroup("imp1", "g2");

    expect(store.getState().layerGroups[0].importIds).toEqual([]);
    expect(store.getState().layerGroups[1].importIds).toEqual(["imp1"]);
  });

  it("toVectorObjectsForGroup returns only grouped import vectors", () => {
    const store = makeStore();
    store.setState({
      imports: [
        {
          id: "imp1",
          name: "One",
          visible: true,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          svgWidth: 10,
          svgHeight: 10,
          paths: [{ id: "p1", d: "M0 0", svgSource: "", visible: true }],
        },
        {
          id: "imp2",
          name: "Two",
          visible: true,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          svgWidth: 10,
          svgHeight: 10,
          paths: [{ id: "p2", d: "M0 0", svgSource: "", visible: true }],
        },
      ] as any,
      layerGroups: [
        { id: "g1", name: "One", color: "#111", importIds: ["imp1"] },
      ],
    });

    const result = store.getState().toVectorObjectsForGroup("g1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
  });

  it("toVectorObjectsUngrouped excludes grouped imports", () => {
    const store = makeStore();
    store.setState({
      imports: [
        {
          id: "imp1",
          name: "One",
          visible: true,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          svgWidth: 10,
          svgHeight: 10,
          paths: [{ id: "p1", d: "M0 0", svgSource: "", visible: true }],
        },
        {
          id: "imp2",
          name: "Two",
          visible: true,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          svgWidth: 10,
          svgHeight: 10,
          paths: [{ id: "p2", d: "M0 0", svgSource: "", visible: true }],
        },
      ] as any,
      layerGroups: [
        { id: "g1", name: "One", color: "#111", importIds: ["imp1"] },
      ],
    });

    const result = store.getState().toVectorObjectsUngrouped();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p2");
  });
});

describe("layerGroupSlice undo", () => {
  it("undoes adding, assigning to and removing a group, one step at a time", async () => {
    const store = makeStore();
    store.getState().addLayerGroup("Pen 1", "#111111");
    const id = store.getState().layerGroups[0].id;
    await nextTurn();
    store.getState().assignImportToGroup("imp1", id);
    await nextTurn();
    store.getState().removeLayerGroup(id);
    expect(store.getState().undoStack).toHaveLength(3);

    store.getState().undo();
    expect(store.getState().layerGroups[0].importIds).toEqual(["imp1"]);
    store.getState().undo();
    expect(store.getState().layerGroups[0].importIds).toEqual([]);
    store.getState().undo();
    expect(store.getState().layerGroups).toEqual([]);
  });

  it("records nothing for a change that changes nothing", () => {
    const store = makeStore();
    store.setState({ layerGroups: [{ id: "g1", name: "One", color: "#111", importIds: ["imp1"] }] });

    store.getState().removeLayerGroup("missing");
    store.getState().updateLayerGroup("g1", { name: "One" });
    store.getState().assignImportToGroup("imp1", "g1");
    store.getState().assignImportToGroup("imp2", null);

    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().revision).toBe(store.getState().savedRevision);
  });

  it("makes one undo step of a name typed letter by letter", async () => {
    const store = makeStore();
    store.setState({ layerGroups: [{ id: "g1", name: "", color: "#111", importIds: [] }] });

    for (const name of ["B", "Bl", "Blu", "Blue"]) {
      store.getState().updateLayerGroup("g1", { name });
      await nextTurn();
    }

    expect(store.getState().undoStack).toHaveLength(1);
    store.getState().undo();
    expect(store.getState().layerGroups[0].name).toBe("");
  });
});
