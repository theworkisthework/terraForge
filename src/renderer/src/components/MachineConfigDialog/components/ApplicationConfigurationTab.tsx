import React from "react";
import type { MachineConfigDialogController } from "../hooks/useMachineConfigDialogController";
import { AppTogglesSections } from "./Application/AppTogglesSections";
import { VinylCuttingSection } from "./Application/VinylCuttingSection";
import { InkServiceStationsSection } from "./Application/InkServiceStationsSection";

interface ApplicationConfigurationTabProps {
  controller: MachineConfigDialogController;
}

export function ApplicationConfigurationTab({
  controller,
}: ApplicationConfigurationTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <AppTogglesSections controller={controller} />
      <VinylCuttingSection controller={controller} />
      <InkServiceStationsSection controller={controller} />
    </div>
  );
}
