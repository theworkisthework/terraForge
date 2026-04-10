import type { DragEvent } from "react";
import type { SvgImport } from "../../../../types";

export interface ImportHeaderRowProps {
  imp: SvgImport;
  indented: boolean;
  isExpanded: boolean;
  isEditingName: boolean;
  editingNameValue: string;
  onSelectImport: (importId: string) => void;
  onToggleExpand: (importId: string) => void;
  onToggleVisibility: (importId: string, visible: boolean) => void;
  onStartRename: (importId: string, currentName: string) => void;
  onEditingNameChange: (nextValue: string) => void;
  onCommitName: (importId: string, nextName: string) => void;
  onCancelName: () => void;
  onDeleteImport: (importId: string) => void;
  onDragStart: (event: DragEvent<HTMLSpanElement>, importId: string) => void;
  onDragEnd: () => void;
}
