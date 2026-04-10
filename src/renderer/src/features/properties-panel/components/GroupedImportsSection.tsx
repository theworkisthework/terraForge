import { useGroupedImportsSectionModel } from "../hooks/useGroupedImportsSectionModel";
import { GroupedImportsGroup } from "./GroupedImportsGroup";
import type { GroupedImportsSectionProps } from "./GroupedImportsSection.types";

export function GroupedImportsSection({
  layerGroups,
  imports,
  collapsedGroupIds,
  dragOverGroupId,
  selectedGroupId,
  editingGroupName,
  onSelectGroup,
  onGroupDragOver,
  onGroupDragLeave,
  onGroupDrop,
  onToggleGroupCollapse,
  onUpdateLayerGroup,
  onStartGroupRename,
  onChangeGroupRename,
  onCommitGroupRename,
  onCancelGroupRename,
  onRemoveLayerGroup,
  renderImport,
}: GroupedImportsSectionProps) {
  const groupsView = useGroupedImportsSectionModel({
    layerGroups,
    imports,
    collapsedGroupIds,
    dragOverGroupId,
    selectedGroupId,
    editingGroupName,
  });

  return (
    <>
      {groupsView.map((groupView) => (
        <GroupedImportsGroup
          key={groupView.group.id}
          group={groupView.group}
          members={groupView.members}
          isCollapsed={groupView.isCollapsed}
          isDropTarget={groupView.isDropTarget}
          isSelected={groupView.isSelected}
          isEditingName={groupView.isEditingName}
          editingNameValue={groupView.editingNameValue}
          selectedGroupId={selectedGroupId}
          onSelectGroup={onSelectGroup}
          onGroupDragOver={onGroupDragOver}
          onGroupDragLeave={onGroupDragLeave}
          onGroupDrop={onGroupDrop}
          onToggleGroupCollapse={onToggleGroupCollapse}
          onUpdateLayerGroup={onUpdateLayerGroup}
          onStartGroupRename={onStartGroupRename}
          onChangeGroupRename={onChangeGroupRename}
          onCommitGroupRename={onCommitGroupRename}
          onCancelGroupRename={onCancelGroupRename}
          onRemoveLayerGroup={onRemoveLayerGroup}
          renderImport={renderImport}
        />
      ))}
    </>
  );
}
