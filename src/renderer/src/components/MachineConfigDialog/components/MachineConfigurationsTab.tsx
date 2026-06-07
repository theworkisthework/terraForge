import React from "react";
import type { MachineConfigDialogController } from "../hooks/useMachineConfigDialogController";
import { MachineConfigsSidebar } from "./Machine/MachineConfigsSidebar";
import { MachineGeneralSection } from "./Machine/MachineGeneralSection";
import { MachinePenCommandsSection } from "./Machine/MachinePenCommandsSection";
import { MachineConnectionSection } from "./Machine/MachineConnectionSection";

interface MachineConfigurationsTabProps {
  controller: MachineConfigDialogController;
}

export function MachineConfigurationsTab({
  controller,
}: MachineConfigurationsTabProps) {
  const { isLocked, handleDisconnectForEdit } = controller;

  return (
    <div className="flex flex-1 min-h-0">
      <MachineConfigsSidebar controller={controller} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLocked && (
          <button
            type="button"
            onClick={() => void handleDisconnectForEdit()}
            className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/40 border border-amber-700 text-amber-300 text-xs hover:bg-amber-900/55 transition-colors"
            title="Click to disconnect"
          >
            <span className="text-base leading-none">🔒</span>
            <span>
              Machine is connected - click to disconnect and edit the active
              profile.
            </span>
          </button>
        )}

        <fieldset disabled={isLocked} className="space-y-6 disabled:opacity-60">
          <MachineGeneralSection controller={controller} />
          <MachinePenCommandsSection controller={controller} />
          <MachineConnectionSection controller={controller} />
        </fieldset>
      </div>
    </div>
  );
}
