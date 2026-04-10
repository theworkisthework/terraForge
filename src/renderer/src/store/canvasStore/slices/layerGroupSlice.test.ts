import { describe, it, expect } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createLayerGroupSlice } from "./layerGroupSlice";

type LayerGroupState = ReturnType<typeof createLayerGroupSlice> & {
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
};

function makeStore() {
  return create<LayerGroupState>()(
    immer((set, get) => ({
      imports: [],
      selectedGroupId: null,
      ...createLayerGroupSlice(set as any, get as any),
    })),
  );
}

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
