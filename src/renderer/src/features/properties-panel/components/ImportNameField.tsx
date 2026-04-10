import type { KeyboardEvent } from "react";

interface ImportNameFieldProps {
  isEditingName: boolean;
  editingNameValue: string;
  name: string;
  onEditingNameChange: (nextValue: string) => void;
  onCommitName: () => void;
  onCancelName: () => void;
  onStartRename: () => void;
}

export function ImportNameField({
  isEditingName,
  editingNameValue,
  name,
  onEditingNameChange,
  onCommitName,
  onCancelName,
  onStartRename,
}: ImportNameFieldProps) {
  const onNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") onCommitName();
    if (event.key === "Escape") onCancelName();
  };

  if (isEditingName) {
    return (
      <input
        autoFocus
        value={editingNameValue}
        className="flex-1 min-w-0 bg-app border border-accent rounded px-1 text-[10px] outline-none"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onEditingNameChange(event.target.value)}
        onBlur={onCommitName}
        onKeyDown={onNameKeyDown}
      />
    );
  }

  return (
    <span
      className="flex-1 min-w-0 text-[10px] truncate text-content"
      title="Double-click to rename"
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStartRename();
      }}
    >
      {name}
    </span>
  );
}
