import type { DragEvent } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { LayerGroup } from "../../../../types";

interface GroupHeaderRowProps {
  group: LayerGroup;
  isCollapsed: boolean;
  isDropTarget: boolean;
  isSelected: boolean;
  membersCount: number;
  isEditingName: boolean;
  editingNameValue: string;
  onToggleSelect: (groupId: string) => void;
  onDragOverGroup: (event: DragEvent<HTMLDivElement>, groupId: string) => void;
  onDragLeaveGroup: (event: DragEvent<HTMLDivElement>) => void;
  onDropGroup: (event: DragEvent<HTMLDivElement>, groupId: string) => void;
  onToggleCollapse: (groupId: string) => void;
  onUpdateGroupColor: (groupId: string, color: string) => void;
  onStartEditName: (groupId: string, currentName: string) => void;
  onEditingNameChange: (nextValue: string) => void;
  onCommitName: (groupId: string, nextValue: string) => void;
  onCancelEditName: () => void;
  onRemoveGroup: (groupId: string) => void;
}

export function GroupHeaderRow({
  group,
  isCollapsed,
  isDropTarget,
  isSelected,
  membersCount,
  isEditingName,
  editingNameValue,
  onToggleSelect,
  onDragOverGroup,
  onDragLeaveGroup,
  onDropGroup,
  onToggleCollapse,
  onUpdateGroupColor,
  onStartEditName,
  onEditingNameChange,
  onCommitName,
  onCancelEditName,
  onRemoveGroup,
}: GroupHeaderRowProps) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 transition-colors cursor-pointer ${
        isSelected
          ? "bg-secondary/20 ring-1 ring-inset ring-secondary/40"
          : isDropTarget
            ? "bg-accent/15 ring-1 ring-inset ring-accent/30"
            : "hover:bg-secondary/10"
      }`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input")) return;
        onToggleSelect(group.id);
      }}
      onDragOver={(e) => onDragOverGroup(e, group.id)}
      onDragLeave={onDragLeaveGroup}
      onDrop={(e) => onDropGroup(e, group.id)}
    >
      <button
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? "Expand group" : "Collapse group"}
        className="text-content-faint hover:text-content text-[10px] w-4 shrink-0"
        onClick={() => onToggleCollapse(group.id)}
      >
        {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
      </button>

      <input
        type="color"
        value={group.color}
        onChange={(e) => onUpdateGroupColor(group.id, e.target.value)}
        className="cursor-pointer border-0 rounded shrink-0"
        style={{ width: 14, height: 14, padding: 0 }}
        title="Group colour"
        onClick={(e) => e.stopPropagation()}
      />

      {isEditingName ? (
        <input
          type="text"
          className="flex-1 min-w-0 bg-transparent text-[10px] text-content border-b border-accent outline-none"
          value={editingNameValue}
          autoFocus
          onChange={(e) => onEditingNameChange(e.target.value)}
          onBlur={() => onCommitName(group.id, editingNameValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitName(group.id, editingNameValue);
            if (e.key === "Escape") onCancelEditName();
          }}
        />
      ) : (
        <span
          className="flex-1 min-w-0 text-[10px] text-content font-medium truncate cursor-pointer"
          title="Double-click to rename"
          onDoubleClick={() => onStartEditName(group.id, group.name)}
        >
          {group.name}
        </span>
      )}

      <span className="text-[9px] text-content-faint shrink-0">
        {membersCount}
      </span>

      <button
        className="text-content-faint hover:text-accent shrink-0"
        title="Delete group (layers become ungrouped)"
        onClick={() => onRemoveGroup(group.id)}
      >
        ✕
      </button>
    </div>
  );
}
