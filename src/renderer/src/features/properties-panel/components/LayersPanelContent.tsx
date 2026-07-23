import { usePropertiesPanelStoreBindings } from "../hooks/usePropertiesPanelStoreBindings";
import { PanelScrollBody } from "./PanelScrollBody";
import { ToolpathSection } from "./ToolpathSection";
import { LayersHeader } from "./LayersHeader";
import { EmptyState } from "./EmptyState";
import { ImportsByGroupList } from "./ImportsByGroupList";
import { useAddLayerGroup } from "../hooks/useAddLayerGroup";
import { useInspectorInteractionState } from "../hooks/useInspectorInteractionState";
import { useImportDragDrop } from "../hooks/useImportDragDrop";
import { usePanelExpansionState } from "../hooks/usePanelExpansionState";
import { usePanelNameEditing } from "../hooks/usePanelNameEditing";
import { usePropertiesPanelDerivedData } from "../hooks/usePropertiesPanelDerivedData";
import { useSyncedStrokeWidth } from "../hooks/useSyncedStrokeWidth";

/**
 * Scrollable body content of the Properties panel.
 *
 * Owns all hook orchestration (expansion state, drag-and-drop, name editing,
 * inspector interaction, layer groups, stroke-width sync) and composes the
 * toolpath section, layers header, and imports list.
 *
 * Extracted from PropertiesPanel.tsx to keep the top-level component thin.
 */
export function LayersPanelContent() {
  // ── Store subscriptions ─────────────────────────────────────────────────
  const {
    imports,
    selectedImportId,
    selectImport,
    removeImport,
    updateImport,
    updatePath,
    updateImportLayer,
    removePath,
    applyHatch,
    showCentreMarker,
    toggleCentreMarker,
    gcodeToolpath,
    gcodeSource,
    setGcodeToolpath,
    toolpathSelected,
    selectToolpath,
    toolpathVisible,
    setToolpathVisible,
    toolpathColorized,
    setToolpathColorized,
    toolpathOpacity,
    setToolpathOpacity,
    layerGroups,
    addLayerGroup,
    removeLayerGroup,
    updateLayerGroup,
    assignImportToGroup,
    selectedGroupId,
    selectGroup,
    pageTemplate,
    pageSizes,
    activeConfig,
    machineStatus,
  } = usePropertiesPanelStoreBindings();

  // ── Derived values ───────────────────────────────────────────────────────
  const {
    importGroupId,
    isJobActive,
    fallbackFeedrate,
    bedW,
    bedH,
    origin,
    toolpathFileName,
  } = usePropertiesPanelDerivedData({
    layerGroups,
    machineStatus,
    activeConfig,
    gcodeSource,
  });

  // ── Expansion / collapse state ───────────────────────────────────────────
  const {
    expandedIds,
    collapsedGroupIds,
    expandedLayerKeys,
    setCollapsedGroupIds,
    toggleExpand,
    toggleGroupCollapse,
    toggleLayerCollapse,
  } = usePanelExpansionState();

  // ── Inspector interaction state ──────────────────────────────────────────
  const {
    rotStep,
    stepFlyoutOpen,
    ratioLocked,
    templateAlignEnabled,
    templateAlignTarget,
    templateScaleEnabled,
    templateScaleTarget,
    setRatioLocked,
    setTemplateAlignEnabled,
    setTemplateAlignTarget,
    setTemplateScaleEnabled,
    setTemplateScaleTarget,
    toggleStepFlyout,
    closeStepFlyout,
    selectRotStep,
  } = useInspectorInteractionState();

  // ── Drag-and-drop ────────────────────────────────────────────────────────
  const {
    draggingImportId,
    dragOverGroupId,
    showUngroupedHint,
    handleImportDragStart,
    handleImportDragEnd,
    handleGroupDragOver,
    handleGroupDragLeave,
    handleGroupDrop,
    handleUngroupedDragOver,
    handleUngroupedDragLeave,
    handleUngroupedDrop,
  } = useImportDragDrop({
    assignImportToGroup,
    importGroupId,
    setCollapsedGroupIds,
  });

  // ── Inline rename editing ────────────────────────────────────────────────
  const {
    editingName,
    editingGroupName,
    startImportRename,
    changeImportRename,
    commitImportRename,
    cancelImportRename,
    startGroupRename,
    changeGroupRename,
    commitGroupRename,
    cancelGroupRename,
  } = usePanelNameEditing({
    updateImport,
    updateLayerGroup,
  });

  // ── Stroke-width sync ────────────────────────────────────────────────────
  const syncStrokeWidth = useSyncedStrokeWidth({
    imports,
    layerGroups,
    importGroupId,
    updateImport,
  });

  // ── Add layer group ──────────────────────────────────────────────────────
  const handleAddLayerGroup = useAddLayerGroup({
    groupCount: layerGroups.length,
    addLayerGroup,
  });

  return (
    <PanelScrollBody>
      {imports.length === 0 && !gcodeToolpath ? (
        <EmptyState message="No objects. Import an SVG." />
      ) : (
        <>
          {/* G-code toolpath row — shown when a .gcode file has been loaded */}
          {gcodeToolpath && (
            <ToolpathSection
              toolpath={gcodeToolpath}
              fileName={toolpathFileName}
              selected={toolpathSelected}
              visible={toolpathVisible}
              colorized={toolpathColorized}
              opacity={toolpathOpacity}
              isJobActive={isJobActive}
              fallbackFeedrate={fallbackFeedrate}
              onToggleSelected={() => selectToolpath(!toolpathSelected)}
              onSetVisible={setToolpathVisible}
              onSetColorized={setToolpathColorized}
              onSetOpacity={setToolpathOpacity}
              onClear={() => setGcodeToolpath(null)}
            />
          )}

          {/* "Layers" section heading + add-group button */}
          <LayersHeader
            show={imports.length > 0}
            onAddGroup={handleAddLayerGroup}
          />

          {/* All imports, organised into collapsible layer groups */}
          {imports.length > 0 && (
            <ImportsByGroupList
              imports={imports}
              layerGroups={layerGroups}
              selectedImportId={selectedImportId}
              selectedGroupId={selectedGroupId}
              expandedIds={expandedIds}
              collapsedGroupIds={collapsedGroupIds}
              expandedLayerKeys={expandedLayerKeys}
              draggingImportId={draggingImportId}
              dragOverGroupId={dragOverGroupId}
              showUngroupedHint={showUngroupedHint}
              bedW={bedW}
              bedH={bedH}
              origin={origin}
              pageTemplate={pageTemplate}
              pageSizes={pageSizes}
              templateAlignEnabled={templateAlignEnabled}
              templateAlignTarget={templateAlignTarget}
              templateScaleEnabled={templateScaleEnabled}
              templateScaleTarget={templateScaleTarget}
              ratioLocked={ratioLocked}
              rotStep={rotStep}
              stepFlyoutOpen={stepFlyoutOpen}
              showCentreMarker={showCentreMarker}
              editingName={editingName}
              editingGroupName={editingGroupName}
              importGroupId={importGroupId}
              onSelectImport={selectImport}
              onSelectGroup={selectGroup}
              onToggleExpand={toggleExpand}
              onToggleGroupCollapse={toggleGroupCollapse}
              onToggleLayerCollapse={toggleLayerCollapse}
              onUpdateImport={updateImport}
              onUpdateImportLayer={updateImportLayer}
              onUpdatePath={updatePath}
              onUpdateLayerGroup={updateLayerGroup}
              onRemoveImport={removeImport}
              onRemovePath={removePath}
              onRemoveLayerGroup={removeLayerGroup}
              onApplyHatch={applyHatch}
              onSyncStrokeWidth={syncStrokeWidth}
              onToggleCentreMarker={toggleCentreMarker}
              onTemplateAlignEnabledChange={setTemplateAlignEnabled}
              onTemplateAlignTargetChange={setTemplateAlignTarget}
              onTemplateScaleEnabledChange={setTemplateScaleEnabled}
              onTemplateScaleTargetChange={setTemplateScaleTarget}
              onRatioLockedChange={setRatioLocked}
              onToggleStepFlyout={toggleStepFlyout}
              onCloseStepFlyout={closeStepFlyout}
              onSelectRotStep={selectRotStep}
              onImportDragStart={handleImportDragStart}
              onImportDragEnd={handleImportDragEnd}
              onGroupDragOver={handleGroupDragOver}
              onGroupDragLeave={handleGroupDragLeave}
              onGroupDrop={handleGroupDrop}
              onUngroupedDragOver={handleUngroupedDragOver}
              onUngroupedDragLeave={handleUngroupedDragLeave}
              onUngroupedDrop={handleUngroupedDrop}
              onStartImportRename={startImportRename}
              onChangeImportRename={changeImportRename}
              onCommitImportRename={commitImportRename}
              onCancelImportRename={cancelImportRename}
              onStartGroupRename={startGroupRename}
              onChangeGroupRename={changeGroupRename}
              onCommitGroupRename={commitGroupRename}
              onCancelGroupRename={cancelGroupRename}
            />
          )}
        </>
      )}
    </PanelScrollBody>
  );
}
