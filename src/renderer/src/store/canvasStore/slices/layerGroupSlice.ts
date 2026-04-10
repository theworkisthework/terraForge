import { v4 as uuid } from "uuid";
import {
  vectorObjectsForGroup,
  vectorObjectsUngrouped,
} from "../services/vectorObjects";
import type { CanvasStateCreator, LayerGroupSlice } from "../types";

export const createLayerGroupSlice: CanvasStateCreator<LayerGroupSlice> = (
  set,
  get,
) => ({
  layerGroups: [],

  addLayerGroup: (name, color) =>
    set((state) => {
      state.layerGroups.push({ id: uuid(), name, color, importIds: [] });
    }),

  removeLayerGroup: (id) =>
    set((state) => {
      state.layerGroups = state.layerGroups.filter((group) => group.id !== id);
      if (state.selectedGroupId === id) state.selectedGroupId = null;
    }),

  updateLayerGroup: (id, patch) =>
    set((state) => {
      const group = state.layerGroups.find((item) => item.id === id);
      if (!group) return;
      if (patch.name !== undefined) group.name = patch.name;
      if (patch.color !== undefined) group.color = patch.color;
    }),

  assignImportToGroup: (importId, groupId) =>
    set((state) => {
      for (const group of state.layerGroups) {
        group.importIds = group.importIds.filter((id) => id !== importId);
      }
      if (groupId !== null) {
        const group = state.layerGroups.find((item) => item.id === groupId);
        if (group && !group.importIds.includes(importId)) {
          group.importIds.push(importId);
        }
      }
    }),

  toVectorObjectsForGroup: (groupId) => {
    const { imports, layerGroups } = get();
    return vectorObjectsForGroup(imports, layerGroups, groupId);
  },

  toVectorObjectsUngrouped: () => {
    const { imports, layerGroups } = get();
    return vectorObjectsUngrouped(imports, layerGroups);
  },
});
