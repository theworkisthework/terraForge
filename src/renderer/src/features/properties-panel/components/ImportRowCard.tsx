import type { DragEvent } from "react";
import type { SvgImport } from "../../../../../types";
import type { RotStep } from "../utils/rotation";
import { ImportHeaderRow } from "./ImportHeaderRow";
import { ImportPathsList } from "./ImportPathsList";
import { ImportPropertiesForm } from "./ImportPropertiesForm";

interface ImportRowCardProps {
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

export function ImportRowCard({
  imp,
  indented,
  isSelected,
  isExpanded,
  isDragging,
  groupColor,
  expandedLayerKeys,
  isEditingName,
  editingNameValue,
  bedW,
  bedH,
  pageW,
  pageH,
  marginMM,
  canAlignToTemplate,
  templateAlignEnabled,
  templateAlignTarget,
  ratioLocked,
  rotStep,
  stepFlyoutOpen,
  showCentreMarker,
  onSelectImport,
  onToggleExpand,
  onToggleVisibility,
  onStartRename,
  onEditingNameChange,
  onCommitName,
  onCancelName,
  onDeleteImport,
  onDragStart,
  onDragEnd,
  onToggleLayerCollapse,
  onUpdateLayerVisibility,
  onUpdatePathVisibility,
  onRemovePath,
  onUpdate,
  onTemplateAlignEnabledChange,
  onTemplateAlignTargetChange,
  onRatioLockedChange,
  onToggleStepFlyout,
  onCloseStepFlyout,
  onSelectRotStep,
  onToggleCentreMarker,
  onChangeStrokeWidth,
  onApplyHatch,
}: ImportRowCardProps) {
  return (
    <div
      className={`border-b border-border-ui/20 ${isSelected ? "bg-secondary/20" : ""} ${isDragging ? "opacity-40" : ""}`}
      style={{
        ...(groupColor && !indented
          ? { borderLeft: `3px solid ${groupColor}` }
          : {}),
      }}
    >
      <ImportHeaderRow
        imp={imp}
        indented={indented}
        isExpanded={isExpanded}
        isEditingName={isEditingName}
        editingNameValue={editingNameValue}
        onSelectImport={onSelectImport}
        onToggleExpand={onToggleExpand}
        onToggleVisibility={onToggleVisibility}
        onStartRename={onStartRename}
        onEditingNameChange={onEditingNameChange}
        onCommitName={onCommitName}
        onCancelName={onCancelName}
        onDeleteImport={onDeleteImport}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />

      {isExpanded && (
        <ImportPathsList
          imp={imp}
          expandedLayerKeys={expandedLayerKeys}
          onSelectImport={onSelectImport}
          onToggleLayerCollapse={onToggleLayerCollapse}
          onUpdateLayerVisibility={onUpdateLayerVisibility}
          onUpdatePathVisibility={onUpdatePathVisibility}
          onRemovePath={onRemovePath}
        />
      )}

      {isSelected && (
        <div
          className="px-3 pb-3 pt-2 border-t border-border-ui/30"
          onDragStart={(e) => e.stopPropagation()}
        >
          <ImportPropertiesForm
            imp={imp}
            bedW={bedW}
            bedH={bedH}
            pageW={pageW}
            pageH={pageH}
            marginMM={marginMM}
            canAlignToTemplate={canAlignToTemplate}
            templateAlignEnabled={templateAlignEnabled}
            templateAlignTarget={templateAlignTarget}
            ratioLocked={ratioLocked}
            rotStep={rotStep}
            stepFlyoutOpen={stepFlyoutOpen}
            showCentreMarker={showCentreMarker}
            onUpdate={onUpdate}
            onTemplateAlignEnabledChange={onTemplateAlignEnabledChange}
            onTemplateAlignTargetChange={onTemplateAlignTargetChange}
            onRatioLockedChange={onRatioLockedChange}
            onToggleStepFlyout={onToggleStepFlyout}
            onCloseStepFlyout={onCloseStepFlyout}
            onSelectRotStep={onSelectRotStep}
            onToggleCentreMarker={onToggleCentreMarker}
            onChangeStrokeWidth={onChangeStrokeWidth}
            onApplyHatch={onApplyHatch}
          />
        </div>
      )}
    </div>
  );
}
