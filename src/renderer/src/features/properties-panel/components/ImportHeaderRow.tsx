import type { DragEvent } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import type { SvgImport } from "../../../../types";

interface ImportHeaderRowProps {
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
  return (
    <div
      className={`flex items-center gap-1 py-1.5 cursor-pointer hover:bg-secondary/20 ${indented ? "pl-5 pr-2" : "px-2"}`}
      onClick={() => onSelectImport(imp.id)}
    >
      <span
        className="text-content-faint hover:text-content-muted shrink-0 mr-0.5 select-none"
        style={{ cursor: "grab", fontSize: "10px" }}
        title="Drag to a group"
        draggable
        onDragStart={(e) => onDragStart(e, imp.id)}
        onDragEnd={onDragEnd}
      >
        ⠿
      </span>

      <button
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "Collapse paths" : "Expand paths"}
        className="text-content-faint hover:text-content text-[10px] w-4 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onSelectImport(imp.id);
          onToggleExpand(imp.id);
        }}
      >
        {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>

      <span
        className="text-content-faint hover:text-content text-[10px] cursor-pointer shrink-0"
        title="Toggle visibility"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility(imp.id, !imp.visible);
        }}
      >
        {imp.visible ? <Eye size={10} /> : <EyeOff size={10} />}
      </span>

      {isEditingName ? (
        <input
          autoFocus
          value={editingNameValue}
          className="flex-1 min-w-0 bg-app border border-accent rounded px-1 text-[10px] outline-none"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onEditingNameChange(e.target.value)}
          onBlur={() => onCommitName(imp.id, editingNameValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitName(imp.id, editingNameValue);
            if (e.key === "Escape") onCancelName();
          }}
        />
      ) : (
        <span
          className="flex-1 min-w-0 text-[10px] truncate text-content"
          title="Double-click to rename"
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartRename(imp.id, imp.name);
          }}
        >
          {imp.name}
        </span>
      )}

      <span className="text-[9px] text-content-faint shrink-0 ml-1">
        {imp.paths.length}p
      </span>
      <button
        className="ml-1 text-content-faint hover:text-accent shrink-0"
        title="Delete import"
        onClick={(e) => {
          e.stopPropagation();
          onDeleteImport(imp.id);
        }}
      >
        ✕
      </button>
    </div>
  );
}
