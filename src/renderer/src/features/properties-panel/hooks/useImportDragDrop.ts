import { useState } from "react";
import type { Dispatch, DragEvent, SetStateAction } from "react";

interface UseImportDragDropArgs {
  assignImportToGroup: (importId: string, groupId: string | null) => void;
  importGroupId: (importId: string) => string | null;
  setCollapsedGroupIds: Dispatch<SetStateAction<Set<string>>>;
}

export function useImportDragDrop({
  assignImportToGroup,
  importGroupId,
  setCollapsedGroupIds,
}: UseImportDragDropArgs) {
  const [draggingImportId, setDraggingImportId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  const handleImportDragStart = (
    event: DragEvent<HTMLSpanElement>,
    importId: string,
  ) => {
    setDraggingImportId(importId);
    event.dataTransfer.setData("text/plain", importId);
    event.dataTransfer.effectAllowed = "move";
  };

  const resetDragState = () => {
    setDraggingImportId(null);
    setDragOverGroupId(null);
  };

  const handleGroupDragOver = (
    event: DragEvent<HTMLDivElement>,
    groupId: string,
  ) => {
    if (!draggingImportId) return;
    event.preventDefault();
    setDragOverGroupId(groupId);
  };

  const handleGroupDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDragOverGroupId(null);
    }
  };

  const handleGroupDrop = (
    event: DragEvent<HTMLDivElement>,
    groupId: string,
  ) => {
    event.preventDefault();
    const importId = event.dataTransfer.getData("text/plain");
    if (importId) {
      assignImportToGroup(importId, groupId);
      setCollapsedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
    resetDragState();
  };

  const handleUngroupedDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!draggingImportId || !importGroupId(draggingImportId)) return;
    event.preventDefault();
    setDragOverGroupId("none");
  };

  const handleUngroupedDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDragOverGroupId(null);
    }
  };

  const handleUngroupedDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const importId = event.dataTransfer.getData("text/plain");
    if (importId) {
      assignImportToGroup(importId, null);
    }
    resetDragState();
  };

  const showUngroupedHint =
    !!draggingImportId && !!importGroupId(draggingImportId);

  return {
    draggingImportId,
    dragOverGroupId,
    showUngroupedHint,
    handleImportDragStart,
    handleImportDragEnd: resetDragState,
    handleGroupDragOver,
    handleGroupDragLeave,
    handleGroupDrop,
    handleUngroupedDragOver,
    handleUngroupedDragLeave,
    handleUngroupedDrop,
  };
}
