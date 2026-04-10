import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useImportHeaderRowModel } from "../hooks/useImportHeaderRowModel";
import { ImportNameField } from "./ImportNameField";
import type { ImportHeaderRowProps } from "./ImportHeaderRow.types";

export function ImportHeaderRow({
  imp,
  indented,
  isExpanded,
  isEditingName,
  editingNameValue,
  onSelectImport,
  onToggleExpand,
  onToggleVisibility,
  onStartRename,
  onEditingNameChange,
  onCommitName,
  onCancelName,
  onDeleteImport,
  onDragStart,
  onDragEnd,
}: ImportHeaderRowProps) {
  const {
    rowClassName,
    onRowClick,
    onDragHandleStart,
    onDragHandleEnd,
    onExpandClick,
    onVisibilityClick,
    onStartRename: onStartRenameField,
    onCommitName: onCommitNameField,
    onDeleteClick,
  } = useImportHeaderRowModel({
    imp,
    indented,
    editingNameValue,
    onSelectImport,
    onToggleExpand,
    onToggleVisibility,
    onStartRename,
    onCommitName,
    onDeleteImport,
    onDragStart,
    onDragEnd,
  });

  return (
    <div className={rowClassName} onClick={onRowClick}>
      <span
        className="text-content-faint hover:text-content-muted shrink-0 mr-0.5 select-none"
        style={{ cursor: "grab", fontSize: "10px" }}
        title="Drag to a group"
        draggable
        onDragStart={onDragHandleStart}
        onDragEnd={onDragHandleEnd}
      >
        ⠿
      </span>

      <button
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "Collapse paths" : "Expand paths"}
        className="text-content-faint hover:text-content text-[10px] w-4 shrink-0"
        onClick={onExpandClick}
      >
        {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>

      <span
        className="text-content-faint hover:text-content text-[10px] cursor-pointer shrink-0"
        title="Toggle visibility"
        onClick={onVisibilityClick}
      >
        {imp.visible ? <Eye size={10} /> : <EyeOff size={10} />}
      </span>

      <ImportNameField
        isEditingName={isEditingName}
        editingNameValue={editingNameValue}
        name={imp.name}
        onEditingNameChange={onEditingNameChange}
        onCommitName={onCommitNameField}
        onCancelName={onCancelName}
        onStartRename={onStartRenameField}
      />

      <span className="text-[9px] text-content-faint shrink-0 ml-1">
        {imp.paths.length}p
      </span>
      <button
        className="ml-1 text-content-faint hover:text-accent shrink-0"
        title="Delete import"
        onClick={onDeleteClick}
      >
        ✕
      </button>
    </div>
  );
}
