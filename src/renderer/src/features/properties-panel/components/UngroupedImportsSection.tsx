import type { DragEvent, ReactNode } from "react";
import type { LayerGroup, SvgImport } from "../../../../../types";
import { UngroupedDropZone } from "./UngroupedDropZone";

interface UngroupedImportsSectionProps {
  imports: SvgImport[];
  layerGroups: LayerGroup[];
  dragOverGroupId: string | null;
  showUngroupedHint: boolean;
  onUngroupedDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onUngroupedDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onUngroupedDrop: (event: DragEvent<HTMLDivElement>) => void;
  renderImport: (imp: SvgImport, indented: boolean) => ReactNode;
}

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
  const ungroupedImports = imports.filter(
    (i) => !layerGroups.some((g) => g.importIds.includes(i.id)),
  );

  return (
    <UngroupedDropZone
      isDropTarget={dragOverGroupId === "none"}
      showHint={showUngroupedHint}
      onDragOver={onUngroupedDragOver}
      onDragLeave={onUngroupedDragLeave}
      onDrop={onUngroupedDrop}
    >
      {ungroupedImports.map((imp) => renderImport(imp, false))}
    </UngroupedDropZone>
  );
}
