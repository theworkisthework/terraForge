import type { DragEvent, ReactNode } from "react";
import type { LayerGroup, SvgImport } from "../../../../../types";
import { EmptyGroupDropHint } from "./EmptyGroupDropHint";
import { GroupHeaderRow } from "./GroupHeaderRow";

interface NameEditState {
  id: string;
  value: string;
}

interface GroupedImportsSectionProps {
  layerGroups: LayerGroup[];
  imports: SvgImport[];
  collapsedGroupIds: Set<string>;
  dragOverGroupId: string | null;
  selectedGroupId: string | null;
  editingGroupName: NameEditState | null;
  onSelectGroup: (groupId: string | null) => void;
  onGroupDragOver: (event: DragEvent<HTMLDivElement>, groupId: string) => void;
  onGroupDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onGroupDrop: (event: DragEvent<HTMLDivElement>, groupId: string) => void;
  onToggleGroupCollapse: (groupId: string) => void;
  onUpdateLayerGroup: (
    groupId: string,
    changes: Partial<{ name: string; color: string }>,
  ) => void;
  onStartGroupRename: (groupId: string, currentName: string) => void;
  onChangeGroupRename: (nextValue: string) => void;
  onCommitGroupRename: (
    groupId: string,
    nextName: string,
    fallbackName: string,
  ) => void;
  onCancelGroupRename: () => void;
  onRemoveLayerGroup: (groupId: string) => void;
  renderImport: (imp: SvgImport, indented: boolean) => ReactNode;
}

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
  return (
    <>
      {layerGroups.map((group) => {
        const members = group.importIds
          .map((id) => imports.find((i) => i.id === id))
          .filter(Boolean) as SvgImport[];
        const isCollapsed = collapsedGroupIds.has(group.id);
        const isDropTarget = dragOverGroupId === group.id;

        return (
          <div key={group.id} className="border-b border-border-ui/40">
            <GroupHeaderRow
              group={group}
              isCollapsed={isCollapsed}
              isDropTarget={isDropTarget}
              isSelected={selectedGroupId === group.id}
              membersCount={members.length}
              isEditingName={editingGroupName?.id === group.id}
              editingNameValue={
                editingGroupName?.id === group.id
                  ? editingGroupName.value
                  : group.name
              }
              onToggleSelect={(groupId) =>
                onSelectGroup(selectedGroupId === groupId ? null : groupId)
              }
              onDragOverGroup={onGroupDragOver}
              onDragLeaveGroup={onGroupDragLeave}
              onDropGroup={onGroupDrop}
              onToggleCollapse={onToggleGroupCollapse}
              onUpdateGroupColor={(groupId, color) =>
                onUpdateLayerGroup(groupId, { color })
              }
              onStartEditName={onStartGroupRename}
              onEditingNameChange={onChangeGroupRename}
              onCommitName={(groupId, nextValue) =>
                onCommitGroupRename(groupId, nextValue, group.name)
              }
              onCancelEditName={onCancelGroupRename}
              onRemoveGroup={onRemoveLayerGroup}
            />

            {!isCollapsed && (
              <div>
                {members.map((imp) => renderImport(imp, true))}
                {members.length === 0 && (
                  <EmptyGroupDropHint isDropTarget={isDropTarget} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
