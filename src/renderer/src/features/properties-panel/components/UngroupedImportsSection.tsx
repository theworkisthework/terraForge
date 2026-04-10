import { useUngroupedImportsSectionModel } from "../hooks/useUngroupedImportsSectionModel";
import { UngroupedDropZone } from "./UngroupedDropZone";
import type { UngroupedImportsSectionProps } from "./UngroupedImportsSection.types";

export function UngroupedImportsSection({
  imports,
  layerGroups,
  dragOverGroupId,
  showUngroupedHint,
  onUngroupedDragOver,
  onUngroupedDragLeave,
  onUngroupedDrop,
  renderImport,
}: UngroupedImportsSectionProps) {
  const { ungroupedImports, isDropTarget } = useUngroupedImportsSectionModel({
    imports,
    layerGroups,
    dragOverGroupId,
  });

  return (
    <UngroupedDropZone
      isDropTarget={isDropTarget}
      showHint={showUngroupedHint}
      onDragOver={onUngroupedDragOver}
      onDragLeave={onUngroupedDragLeave}
      onDrop={onUngroupedDrop}
    >
      {ungroupedImports.map((imp) => renderImport(imp, false))}
    </UngroupedDropZone>
  );
}
