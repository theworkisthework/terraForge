import type { DragEvent, ReactNode } from "react";
import type { LayerGroup, SvgImport } from "../../../../../types";

export interface NameEditState {
  id: string;
  value: string;
}

export interface GroupedImportsSectionProps {
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

export interface GroupedImportsGroupView {
  group: LayerGroup;
  members: SvgImport[];
  isCollapsed: boolean;
  isDropTarget: boolean;
  isSelected: boolean;
  isEditingName: boolean;
  editingNameValue: string;
}
