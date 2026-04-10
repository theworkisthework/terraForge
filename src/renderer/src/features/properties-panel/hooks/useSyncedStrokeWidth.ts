import { useCallback } from "react";
import type { LayerGroup, SvgImport } from "../../../../../types";

interface UseSyncedStrokeWidthArgs {
  imports: SvgImport[];
  layerGroups: LayerGroup[];
  importGroupId: (importId: string) => string | null;
  updateImport: (importId: string, changes: Partial<SvgImport>) => void;
}

export function useSyncedStrokeWidth({
  imports,
  layerGroups,
  importGroupId,
  updateImport,
}: UseSyncedStrokeWidthArgs) {
  return useCallback(
    (changedId: string, widthMM: number) => {
      const groupId = importGroupId(changedId);
      const siblingIds = groupId
        ? (layerGroups.find((group) => group.id === groupId)?.importIds ?? [])
        : imports
            .filter((imp) => importGroupId(imp.id) === null)
            .map((imp) => imp.id);

      for (const id of siblingIds) {
        updateImport(id, { strokeWidthMM: widthMM });
      }
    },
    [imports, layerGroups, importGroupId, updateImport],
  );
}
