import { describe, it, expect } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createSelectionSlice } from "./selectionSlice";

type SelectionState = ReturnType<typeof createSelectionSlice>;

function makeStore() {
  return create<SelectionState>()(
    immer((set, get) => ({
      ...createSelectionSlice(set as any, get as any),
    })),
  );
}

describe("selectionSlice", () => {
  it("starts with expected default selection state", () => {
    const store = makeStore();
    const state = store.getState();

    expect(state.selectedImportId).toBeNull();
    expect(state.selectedPathId).toBeNull();
    expect(state.selectedGroupId).toBeNull();
    expect(state.allImportsSelected).toBe(false);
    expect(state.toolpathSelected).toBe(false);
  });

  it("selectImport clears path/group/all-selected and toolpath when selecting an id", () => {
    const store = makeStore();
    store.setState({
      selectedPathId: "p1",
      selectedGroupId: "g1",
      allImportsSelected: true,
      toolpathSelected: true,
    });

    store.getState().selectImport("imp-1");
    const state = store.getState();

    expect(state.selectedImportId).toBe("imp-1");
    expect(state.selectedPathId).toBeNull();
    expect(state.selectedGroupId).toBeNull();
    expect(state.allImportsSelected).toBe(false);
    expect(state.toolpathSelected).toBe(false);
  });

  it("selectGroup clears import/path/all-selected and toolpath", () => {
    const store = makeStore();
    store.setState({
      selectedImportId: "imp-1",
      selectedPathId: "p1",
      allImportsSelected: true,
      toolpathSelected: true,
    });

    store.getState().selectGroup("g2");
    const state = store.getState();

    expect(state.selectedGroupId).toBe("g2");
    expect(state.selectedImportId).toBeNull();
    expect(state.selectedPathId).toBeNull();
    expect(state.allImportsSelected).toBe(false);
    expect(state.toolpathSelected).toBe(false);
  });

  it("selectToolpath(true) clears all import/group selection", () => {
    const store = makeStore();
    store.setState({
      selectedImportId: "imp-1",
      selectedPathId: "p1",
      selectedGroupId: "g2",
      allImportsSelected: true,
    });

    store.getState().selectToolpath(true);
    const state = store.getState();

    expect(state.toolpathSelected).toBe(true);
    expect(state.selectedImportId).toBeNull();
    expect(state.selectedPathId).toBeNull();
    expect(state.selectedGroupId).toBeNull();
    expect(state.allImportsSelected).toBe(false);
  });

  it("selectToolpath(false) only toggles toolpath selection off", () => {
    const store = makeStore();
    store.setState({
      selectedImportId: "imp-1",
      selectedPathId: "p1",
      selectedGroupId: "g2",
      allImportsSelected: true,
      toolpathSelected: true,
    });

    store.getState().selectToolpath(false);
    const state = store.getState();

    expect(state.toolpathSelected).toBe(false);
    expect(state.selectedImportId).toBe("imp-1");
    expect(state.selectedPathId).toBe("p1");
    expect(state.selectedGroupId).toBe("g2");
    expect(state.allImportsSelected).toBe(true);
  });
});
