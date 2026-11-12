import { v4 as uuid } from "uuid";
import {
  vectorObjectsForGroup,
  vectorObjectsUngrouped,
} from "../services/vectorObjects";
import { coalesceKeyFor, type CanvasHistory } from "../history";
import type { CanvasStateCreator, LayerGroupSlice } from "../types";

export const createLayerGroupSlice = (
  { edit }: CanvasHistory,
): CanvasStateCreator<LayerGroupSlice> => (_set, get) => ({
  layerGroups: [],

  addLayerGroup: (name, color) =>
    edit((state) => {
      state.layerGroups.push({ id: uuid(), name, color, importIds: [] });
    }),

  removeLayerGroup: (id) =>
    edit((state) => {
      if (!state.layerGroups.some((group) => group.id === id)) return;
      state.layerGroups = state.layerGroups.filter((group) => group.id !== id);
      if (state.selectedGroupId === id) state.selectedGroupId = null;
    }),

  updateLayerGroup: (id, patch) =>
    edit((state) => {
      const group = state.layerGroups.find((item) => item.id === id);
      if (!group) return;
      if (patch.name !== undefined) group.name = patch.name;
      if (patch.color !== undefined) group.color = patch.color;
    }, coalesceKeyFor(`group:${id}`, patch)),

  assignImportToGroup: (importId, groupId) =>
    edit((state) => {
      for (const group of state.layerGroups) {
        // Already where it should be: nothing to move, nothing to undo.
        if (group.id === groupId || !group.importIds.includes(importId)) continue;
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
