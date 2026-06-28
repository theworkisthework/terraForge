import React from "react";
import { Button } from "../../../ui";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableConfigItem } from "../SortableConfigItem";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";

interface MachineConfigsSidebarProps {
  controller: MachineConfigDialogController;
}

export function MachineConfigsSidebar({
  controller,
}: MachineConfigsSidebarProps) {
  const {
    machineStore,
    selectedId,
    setSelectedId,
    isNew,
    setIsNew,
    isLocked,
    handleNew,
    handleDuplicate,
    handleDelete,
    handleExport,
    handleImport,
    sensors,
    handleDragEnd,
  } = controller;

  const { configs, activeConfigId } = machineStore;

  return (
    <div className="w-52 border-r border-border-ui flex flex-col">
      <div className="flex-1 overflow-y-auto py-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={configs.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {configs.map((c) => (
              <SortableConfigItem
                key={c.id}
                config={c}
                isSelected={selectedId === c.id && !isNew}
                isActive={c.id === activeConfigId}
                onSelect={() => {
                  setSelectedId(c.id);
                  setIsNew(false);
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
        {isNew && (
          <div className="px-4 py-2 text-sm bg-accent text-white truncate">
            New Machine
          </div>
        )}
      </div>
      <div className="p-2 border-t border-border-ui flex gap-1">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={handleNew}
          title="New config"
        >
          + New
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={handleDuplicate}
          disabled={!selectedId || isNew}
          title="Duplicate selected config"
        >
          Copy
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="flex-1"
          onClick={handleDelete}
          disabled={!selectedId || configs.length <= 1 || isLocked}
          title={
            isLocked
              ? "Disconnect before deleting the active config"
              : "Delete selected config"
          }
        >
          Del
        </Button>
      </div>
      <div className="px-2 pb-2 flex gap-1">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={handleExport}
          title="Export all configs to a JSON file"
        >
          ↑ Export
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={handleImport}
          title="Import configs from a JSON file"
        >
          ↓ Import
        </Button>
      </div>
    </div>
  );
}
