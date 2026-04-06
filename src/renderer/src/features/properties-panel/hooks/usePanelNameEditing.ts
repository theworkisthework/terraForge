import { useState } from "react";

interface NameEditState {
  id: string;
  value: string;
}

interface UsePanelNameEditingArgs {
  updateImport: (id: string, patch: { name?: string }) => void;
  updateLayerGroup: (
    id: string,
    patch: Partial<{ name: string; color: string }>,
  ) => void;
}

export function usePanelNameEditing({
  updateImport,
  updateLayerGroup,
}: UsePanelNameEditingArgs) {
  const [editingName, setEditingName] = useState<NameEditState | null>(null);
  const [editingGroupName, setEditingGroupName] =
    useState<NameEditState | null>(null);

  const startImportRename = (importId: string, currentName: string) => {
    setEditingName({ id: importId, value: currentName });
  };

  const changeImportRename = (nextValue: string) => {
    setEditingName((prev) => (prev ? { ...prev, value: nextValue } : prev));
  };

  const commitImportRename = (importId: string, nextName: string) => {
    updateImport(importId, { name: nextName });
    setEditingName(null);
  };

  const cancelImportRename = () => {
    setEditingName(null);
  };

  const startGroupRename = (groupId: string, currentName: string) => {
    setEditingGroupName({ id: groupId, value: currentName });
  };

  const changeGroupRename = (nextValue: string) => {
    setEditingGroupName((prev) =>
      prev ? { ...prev, value: nextValue } : prev,
    );
  };

  const commitGroupRename = (
    groupId: string,
    nextName: string,
    fallbackName: string,
  ) => {
    updateLayerGroup(groupId, {
      name: nextName.trim() || fallbackName,
    });
    setEditingGroupName(null);
  };

  const cancelGroupRename = () => {
    setEditingGroupName(null);
  };

  return {
    editingName,
    editingGroupName,
    startImportRename,
    changeImportRename,
    commitImportRename,
    cancelImportRename,
    startGroupRename,
    changeGroupRename,
    commitGroupRename,
    cancelGroupRename,
  };
}