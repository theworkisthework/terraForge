import type { DragEvent, ReactNode } from "react";
import type { LayerGroup, SvgImport } from "../../../../../types";
import { EmptyGroupDropHint } from "./EmptyGroupDropHint";
import { GroupHeaderRow } from "./GroupHeaderRow";

interface GroupedImportsGroupProps {
  group: LayerGroup;
  members: SvgImport[];
  isCollapsed: boolean;
  isDropTarget: boolean;
  isSelected: boolean;
  isEditingName: boolean;
  editingNameValue: string;
  selectedGroupId: string | null;
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

export function GroupedImportsGroup({
  group,
  members,
  isCollapsed,
  isDropTarget,
  isSelected,
  isEditingName,
  editingNameValue,
  selectedGroupId,
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
}: GroupedImportsGroupProps) {
  return (
    <div className="border-b border-border-ui/40">
      <GroupHeaderRow
        group={group}
        isCollapsed={isCollapsed}
        isDropTarget={isDropTarget}
        isSelected={isSelected}
        membersCount={members.length}
        isEditingName={isEditingName}
        editingNameValue={editingNameValue}
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
}
