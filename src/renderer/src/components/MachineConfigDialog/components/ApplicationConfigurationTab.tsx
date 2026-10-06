import React from "react";
import type { MachineConfigDialogController } from "../hooks/useMachineConfigDialogController";
import { AppTogglesSections } from "./Application/AppTogglesSections";
import { VinylCuttingSection } from "./Application/VinylCuttingSection";
import { InkServiceStationsSection } from "./Application/InkServiceStationsSection";
import { BitmapImportSection } from "./Application/BitmapImportSection";
import { BitmapPluginsSection } from "./Application/BitmapPluginsSection";

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
      <BitmapImportSection controller={controller} />
      {/* Plugin management only makes sense once bitmap import itself is on
          — otherwise the dialog shows admin controls for a feature that's
          hidden everywhere else. */}
      {controller.appConfig.bitmapRendererEnabled && <BitmapPluginsSection />}
    </div>
  );
}
