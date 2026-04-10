import type { DragEvent, ReactNode } from "react";

interface UngroupedDropZoneProps {
  isDropTarget: boolean;
  showHint: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export function UngroupedDropZone({
  isDropTarget,
  showHint,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: UngroupedDropZoneProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={
        isDropTarget ? "bg-accent/5 ring-1 ring-inset ring-accent/20" : ""
      }
    >
      {children}
      {showHint && (
        <div
          className={`mx-2 my-1 px-2 py-1 text-[9px] text-center border border-dashed rounded transition-colors ${
            isDropTarget
              ? "border-accent/60 text-accent/70 bg-accent/10"
              : "border-border-ui text-content-faint"
          }`}
        >
          Drop here to remove from group
        </div>
      )}
    </div>
  );
}
