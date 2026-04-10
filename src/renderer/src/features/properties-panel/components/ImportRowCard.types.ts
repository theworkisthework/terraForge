import type { DragEvent } from "react";
import type { SvgImport } from "../../../../../types";
import type { RotStep } from "../utils/rotation";

export interface ImportRowCardProps {
  imp: SvgImport;
  indented: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  isDragging: boolean;
  groupColor: string | null;
  expandedLayerKeys: Set<string>;
  isEditingName: boolean;
  editingNameValue: string;
  bedW: number;
  bedH: number;
  pageW: number;
  pageH: number;
  marginMM: number;
  canAlignToTemplate: boolean;
  templateAlignEnabled: boolean;
  templateAlignTarget: "page" | "margin";
  ratioLocked: boolean;
  rotStep: RotStep;
  stepFlyoutOpen: boolean;
  showCentreMarker: boolean;
  onSelectImport: (importId: string | null) => void;
  onToggleExpand: (id: string) => void;
  onToggleVisibility: (importId: string, visible: boolean) => void;
  onStartRename: (importId: string, currentName: string) => void;
  onEditingNameChange: (nextValue: string) => void;
  onCommitName: (importId: string, nextName: string) => void;
  onCancelName: () => void;
  onDeleteImport: (importId: string) => void;
  onDragStart: (event: DragEvent<HTMLSpanElement>, importId: string) => void;
  onDragEnd: () => void;
  onToggleLayerCollapse: (importId: string, layerId: string) => void;
  onUpdateLayerVisibility: (
    importId: string,
    layerId: string,
    visible: boolean,
  ) => void;
  onUpdatePathVisibility: (
    importId: string,
    pathId: string,
    visible: boolean,
  ) => void;
  onRemovePath: (importId: string, pathId: string) => void;
  onUpdate: (changes: Partial<SvgImport>) => void;
  onTemplateAlignEnabledChange: (v: boolean) => void;
  onTemplateAlignTargetChange: (v: "page" | "margin") => void;
  onRatioLockedChange: (v: boolean) => void;
  onToggleStepFlyout: () => void;
  onCloseStepFlyout: () => void;
  onSelectRotStep: (s: RotStep) => void;
  onToggleCentreMarker: () => void;
  onChangeStrokeWidth: (value: number) => void;
  onApplyHatch: (
    importId: string,
    spacingMM: number,
    angleDeg: number,
    enabled: boolean,
  ) => void;
}
