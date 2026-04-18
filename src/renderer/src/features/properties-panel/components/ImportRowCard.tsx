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
