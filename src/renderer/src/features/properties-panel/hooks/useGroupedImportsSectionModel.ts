import type { SvgImport } from "../../../../../types";
import type {
  GroupedImportsGroupView,
  GroupedImportsSectionProps,
} from "../components/GroupedImportsSection.types";

export function useGroupedImportsSectionModel({
  layerGroups,
  imports,
  collapsedGroupIds,
  dragOverGroupId,
  selectedGroupId,
  editingGroupName,
}: Pick<
  GroupedImportsSectionProps,
  | "layerGroups"
  | "imports"
  | "collapsedGroupIds"
  | "dragOverGroupId"
  | "selectedGroupId"
  | "editingGroupName"
>): GroupedImportsGroupView[] {
  return layerGroups.map((group) => {
    const members = group.importIds
      .map((id) => imports.find((imp) => imp.id === id))
      .filter(Boolean) as SvgImport[];

    return {
      group,
      members,
      isCollapsed: collapsedGroupIds.has(group.id),
      isDropTarget: dragOverGroupId === group.id,
      isSelected: selectedGroupId === group.id,
      isEditingName: editingGroupName?.id === group.id,
      editingNameValue:
        editingGroupName?.id === group.id ? editingGroupName.value : group.name,
    };
  });
}
