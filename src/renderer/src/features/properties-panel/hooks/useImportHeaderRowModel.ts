import type { DragEvent, MouseEvent } from "react";
import type { ImportHeaderRowProps } from "../components/ImportHeaderRow.types";

export function useImportHeaderRowModel({
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
}: Pick<
  ImportHeaderRowProps,
  | "imp"
  | "indented"
  | "editingNameValue"
  | "onSelectImport"
  | "onToggleExpand"
  | "onToggleVisibility"
  | "onStartRename"
  | "onCommitName"
  | "onDeleteImport"
  | "onDragStart"
  | "onDragEnd"
>) {
  return {
    rowClassName: `flex items-center gap-1 py-1.5 cursor-pointer hover:bg-secondary/20 ${indented ? "pl-5 pr-2" : "px-2"}`,
    onRowClick: () => onSelectImport(imp.id),
    onDragHandleStart: (event: DragEvent<HTMLSpanElement>) =>
      onDragStart(event, imp.id),
    onDragHandleEnd: () => onDragEnd(),
    onExpandClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onSelectImport(imp.id);
      onToggleExpand(imp.id);
    },
    onVisibilityClick: (event: MouseEvent<HTMLSpanElement>) => {
      event.stopPropagation();
      onToggleVisibility(imp.id, !imp.visible);
    },
    onStartRename: () => onStartRename(imp.id, imp.name),
    onCommitName: () => onCommitName(imp.id, editingNameValue),
    onDeleteClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onDeleteImport(imp.id);
    },
  };
}
