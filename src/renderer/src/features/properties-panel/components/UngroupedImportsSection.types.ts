import type { DragEvent, ReactNode } from "react";
import type { LayerGroup, SvgImport } from "../../../../../types";

export interface UngroupedImportsSectionProps {
  imports: SvgImport[];
  layerGroups: LayerGroup[];
  dragOverGroupId: string | null;
  showUngroupedHint: boolean;
  onUngroupedDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onUngroupedDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onUngroupedDrop: (event: DragEvent<HTMLDivElement>) => void;
  renderImport: (imp: SvgImport, indented: boolean) => ReactNode;
}
