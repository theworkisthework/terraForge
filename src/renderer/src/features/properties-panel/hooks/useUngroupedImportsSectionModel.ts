import type { SvgImport } from "../../../../../types";
import type { UngroupedImportsSectionProps } from "../components/UngroupedImportsSection.types";

export function useUngroupedImportsSectionModel({
  imports,
  layerGroups,
  dragOverGroupId,
}: Pick<
  UngroupedImportsSectionProps,
  "imports" | "layerGroups" | "dragOverGroupId"
>) {
  const ungroupedImports = imports.filter(
    (imp) => !layerGroups.some((group) => group.importIds.includes(imp.id)),
  );

  return {
    ungroupedImports: ungroupedImports as SvgImport[],
    isDropTarget: dragOverGroupId === "none",
  };
}
