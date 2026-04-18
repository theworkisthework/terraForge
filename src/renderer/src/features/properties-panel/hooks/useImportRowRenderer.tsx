import { useCallback } from "react";
import type { SvgImport } from "../../../../../types";
import type { RotStep } from "../utils/rotation";
import { ImportRowCard } from "../components/ImportRowCard";

interface NameEditState {
  id: string;
  value: string;
}

interface UseImportRowRendererArgs {
  selectedImportId: string | null;
  expandedIds: Set<string>;
  expandedLayerKeys: Set<string>;
  draggingImportId: string | null;
  layerGroups: Array<{ id: string; color: string }>;
  editingName: NameEditState | null;
  bedW: number;
  bedH: number;
  pageW: number;
  pageH: number;
  marginMM: number;
  canAlignToTemplate: boolean;
  templateAlignEnabled: boolean;
  templateAlignTarget: "page" | "margin";
  templateScaleEnabled: boolean;
  templateScaleTarget: "page" | "margin";
  ratioLocked: boolean;
  rotStep: RotStep;
  stepFlyoutOpen: boolean;
  showCentreMarker: boolean;
  importGroupId: (importId: string) => string | null;
  onSelectImport: (importId: string | null) => void;
  onToggleExpand: (importId: string) => void;
  onUpdateImport: (importId: string, changes: Partial<SvgImport>) => void;
  onStartImportRename: (importId: string, currentName: string) => void;
  onChangeImportRename: (nextValue: string) => void;
  onCommitImportRename: (importId: string, nextName: string) => void;
  onCancelImportRename: () => void;
  onRemoveImport: (importId: string) => void;
  onImportDragStart: (
    event: React.DragEvent<HTMLSpanElement>,
    importId: string,
  ) => void;
  onImportDragEnd: () => void;
  onToggleLayerCollapse: (importId: string, layerId: string) => void;
  onUpdateImportLayer: (
    importId: string,
    layerId: string,
    visible: boolean,
  ) => void;
  onUpdatePath: (
    importId: string,
    pathId: string,
    changes: { visible?: boolean },
  ) => void;
  onRemovePath: (importId: string, pathId: string) => void;
  onTemplateAlignEnabledChange: (v: boolean) => void;
  onTemplateAlignTargetChange: (v: "page" | "margin") => void;
  onTemplateScaleEnabledChange: (v: boolean) => void;
  onTemplateScaleTargetChange: (v: "page" | "margin") => void;
  onRatioLockedChange: (v: boolean) => void;
  onToggleStepFlyout: () => void;
  onCloseStepFlyout: () => void;
  onSelectRotStep: (s: RotStep) => void;
  onToggleCentreMarker: () => void;
  onSyncStrokeWidth: (importId: string, widthMM: number) => void;
  onApplyHatch: (
    importId: string,
    spacingMM: number,
    angleDeg: number,
    enabled: boolean,
  ) => void;
}

export function useImportRowRenderer({
  selectedImportId,
  expandedIds,
  expandedLayerKeys,
  draggingImportId,
  layerGroups,
  editingName,
  bedW,
  bedH,
  pageW,
  pageH,
  marginMM,
  canAlignToTemplate,
  templateAlignEnabled,
  templateAlignTarget,
  templateScaleEnabled,
  templateScaleTarget,
  ratioLocked,
  rotStep,
  stepFlyoutOpen,
  showCentreMarker,
  importGroupId,
  onSelectImport,
  onToggleExpand,
  onUpdateImport,
  onStartImportRename,
  onChangeImportRename,
  onCommitImportRename,
  onCancelImportRename,
  onRemoveImport,
  onImportDragStart,
  onImportDragEnd,
  onToggleLayerCollapse,
  onUpdateImportLayer,
  onUpdatePath,
  onRemovePath,
  onTemplateAlignEnabledChange,
  onTemplateAlignTargetChange,
  onTemplateScaleEnabledChange,
  onTemplateScaleTargetChange,
  onRatioLockedChange,
  onToggleStepFlyout,
  onCloseStepFlyout,
  onSelectRotStep,
  onToggleCentreMarker,
  onSyncStrokeWidth,
  onApplyHatch,
}: UseImportRowRendererArgs) {
  return useCallback(
    (imp: SvgImport, indented: boolean) => {
      const isSelected = imp.id === selectedImportId;
      const isExpanded = expandedIds.has(imp.id);
      const groupId = importGroupId(imp.id);
      const groupColor =
        layerGroups.find((g) => g.id === groupId)?.color ?? null;

      return (
        <ImportRowCard
          key={imp.id}
          imp={imp}
          indented={indented}
          isSelected={isSelected}
          isExpanded={isExpanded}
          isDragging={draggingImportId === imp.id}
          groupColor={groupColor}
          expandedLayerKeys={expandedLayerKeys}
          isEditingName={editingName?.id === imp.id}
          editingNameValue={
            editingName?.id === imp.id ? editingName.value : imp.name
          }
          bedW={bedW}
          bedH={bedH}
          pageW={pageW}
          pageH={pageH}
          marginMM={marginMM}
          canAlignToTemplate={canAlignToTemplate}
          templateAlignEnabled={templateAlignEnabled}
          templateAlignTarget={templateAlignTarget}
          templateScaleEnabled={templateScaleEnabled}
          templateScaleTarget={templateScaleTarget}
          ratioLocked={ratioLocked}
          rotStep={rotStep}
          stepFlyoutOpen={stepFlyoutOpen}
          showCentreMarker={showCentreMarker}
          onSelectImport={onSelectImport}
          onToggleExpand={onToggleExpand}
          onToggleVisibility={(importId, visible) =>
            onUpdateImport(importId, { visible })
          }
          onStartRename={onStartImportRename}
          onEditingNameChange={onChangeImportRename}
          onCommitName={onCommitImportRename}
          onCancelName={onCancelImportRename}
          onDeleteImport={onRemoveImport}
          onDragStart={onImportDragStart}
          onDragEnd={onImportDragEnd}
          onToggleLayerCollapse={onToggleLayerCollapse}
          onUpdateLayerVisibility={onUpdateImportLayer}
          onUpdatePathVisibility={(importId, pathId, visible) =>
            onUpdatePath(importId, pathId, { visible })
          }
          onRemovePath={onRemovePath}
          onUpdate={(changes) => onUpdateImport(imp.id, changes)}
          onTemplateAlignEnabledChange={onTemplateAlignEnabledChange}
          onTemplateAlignTargetChange={onTemplateAlignTargetChange}
          onTemplateScaleEnabledChange={onTemplateScaleEnabledChange}
          onTemplateScaleTargetChange={onTemplateScaleTargetChange}
          onRatioLockedChange={onRatioLockedChange}
          onToggleStepFlyout={onToggleStepFlyout}
          onCloseStepFlyout={onCloseStepFlyout}
          onSelectRotStep={onSelectRotStep}
          onToggleCentreMarker={onToggleCentreMarker}
          onChangeStrokeWidth={(value) => onSyncStrokeWidth(imp.id, value)}
          onApplyHatch={onApplyHatch}
        />
      );
    },
    [
      selectedImportId,
      expandedIds,
      importGroupId,
      layerGroups,
      draggingImportId,
      expandedLayerKeys,
      editingName,
      bedW,
      bedH,
      pageW,
      pageH,
      marginMM,
      canAlignToTemplate,
      templateAlignEnabled,
      templateAlignTarget,
      templateScaleEnabled,
      templateScaleTarget,
      ratioLocked,
      rotStep,
      stepFlyoutOpen,
      showCentreMarker,
      onSelectImport,
      onToggleExpand,
      onUpdateImport,
      onStartImportRename,
      onChangeImportRename,
      onCommitImportRename,
      onCancelImportRename,
      onRemoveImport,
      onImportDragStart,
      onImportDragEnd,
      onToggleLayerCollapse,
      onUpdateImportLayer,
      onUpdatePath,
      onRemovePath,
      onTemplateAlignEnabledChange,
      onTemplateAlignTargetChange,
      onTemplateScaleEnabledChange,
      onTemplateScaleTargetChange,
      onRatioLockedChange,
      onToggleStepFlyout,
      onCloseStepFlyout,
      onSelectRotStep,
      onToggleCentreMarker,
      onSyncStrokeWidth,
      onApplyHatch,
    ],
  );
}
