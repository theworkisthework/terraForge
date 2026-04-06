import { useCallback } from "react";
import type { LayerGroup, MachineConfig, MachineStatus } from "../../../../../types";

interface GcodeSourceInfo {
  path: string;
  name: string;
  source: "local" | "fs" | "sd";
}

interface UsePropertiesPanelDerivedDataArgs {
  layerGroups: LayerGroup[];
  machineStatus: MachineStatus | null | undefined;
  activeConfig: () => MachineConfig | undefined;
  gcodeSource: GcodeSourceInfo | null;
}

export function usePropertiesPanelDerivedData({
  layerGroups,
  machineStatus,
  activeConfig,
  gcodeSource,
}: UsePropertiesPanelDerivedDataArgs) {
  const importGroupId = useCallback(
    (importId: string): string | null =>
      layerGroups.find((group) => group.importIds.includes(importId))?.id ?? null,
    [layerGroups],
  );

  const isJobActive =
    machineStatus?.state === "Run" || machineStatus?.state === "Hold";
  const cfg = activeConfig();
  const fallbackFeedrate = cfg?.feedrate ?? 300;
  const bedW = cfg?.bedWidth ?? 220;
  const bedH = cfg?.bedHeight ?? 200;
  const toolpathFileName = gcodeSource?.name ?? "G-code toolpath";

  return {
    importGroupId,
    isJobActive,
    fallbackFeedrate,
    bedW,
    bedH,
    toolpathFileName,
  };
}
