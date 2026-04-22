import { useState } from "react";
import { ImportHeaderRow } from "./ImportHeaderRow";
import { ImportPathsList } from "./ImportPathsList";
import { ImportRowCardDetails } from "./ImportRowCardDetails";
import type { ImportRowCardProps } from "./ImportRowCard.types";

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
  templateScaleEnabled,
  templateScaleTarget,
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
  onUpdatePathFillEnabled,
  onUpdatePathStroke,
  onRemovePath,
  onUpdate,
  onTemplateAlignEnabledChange,
  onTemplateAlignTargetChange,
  onTemplateScaleEnabledChange,
  onTemplateScaleTargetChange,
  onRatioLockedChange,
  onToggleStepFlyout,
  onCloseStepFlyout,
  onSelectRotStep,
  onToggleCentreMarker,
  onChangeStrokeWidth,
  onApplyHatch,
}: ImportRowCardProps) {
  const [groupBy, setGroupBy] = useState<"layer" | "color">("layer");

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
        <>
          <div className="pl-6 pr-2 pt-1 flex gap-2 text-[8px]">
            <button
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                groupBy === "layer"
                  ? "bg-accent text-accent-content"
                  : "bg-surface text-content-muted hover:text-content"
              }`}
              onClick={() => setGroupBy("layer")}
            >
              By Layer
            </button>
            <button
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                groupBy === "color"
                  ? "bg-accent text-accent-content"
                  : "bg-surface text-content-muted hover:text-content"
              }`}
              onClick={() => setGroupBy("color")}
            >
              By Color
            </button>
          </div>
          <ImportPathsList
            imp={imp}
            expandedLayerKeys={expandedLayerKeys}
            groupBy={groupBy}
            onSelectImport={onSelectImport}
            onToggleLayerCollapse={onToggleLayerCollapse}
            onUpdateLayerVisibility={onUpdateLayerVisibility}
            onUpdatePathVisibility={onUpdatePathVisibility}
            onUpdatePathFillEnabled={onUpdatePathFillEnabled}
            onUpdatePathStroke={onUpdatePathStroke}
            onRemovePath={onRemovePath}
          />
        </>
      )}

      {isSelected && (
        <ImportRowCardDetails
          imp={imp}
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
          onUpdate={onUpdate}
          onTemplateAlignEnabledChange={onTemplateAlignEnabledChange}
          onTemplateAlignTargetChange={onTemplateAlignTargetChange}
          onTemplateScaleEnabledChange={onTemplateScaleEnabledChange}
          onTemplateScaleTargetChange={onTemplateScaleTargetChange}
          onRatioLockedChange={onRatioLockedChange}
          onToggleStepFlyout={onToggleStepFlyout}
          onCloseStepFlyout={onCloseStepFlyout}
          onSelectRotStep={onSelectRotStep}
          onToggleCentreMarker={onToggleCentreMarker}
          onChangeStrokeWidth={onChangeStrokeWidth}
          onApplyHatch={onApplyHatch}
        />
      )}
    </div>
  );
}
