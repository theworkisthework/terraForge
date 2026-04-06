// Portions of SVG icon data (rotate-ccw, rotate-cw, magnet, chevron-down, maximize-2, minimize-2, lock, unlock) and Lucide React icons (align-horizontal-justify-start/center/end, align-vertical-justify-start/center/end) from Lucide (https://lucide.dev)
// ISC License
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of
// Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
// Permission to use, copy, modify, and/or distribute this software for any purpose
// with or without fee is hereby granted, provided that the above copyright notice
// and this permission notice appear in all copies.
import { usePropertiesPanelStoreBindings } from "../features/properties-panel/hooks/usePropertiesPanelStoreBindings";
import { PanelHeading } from "../features/properties-panel/components/PanelHeading";
import { PanelScrollBody } from "../features/properties-panel/components/PanelScrollBody";
import { PanelContainer } from "../features/properties-panel/components/PanelContainer";
import { ToolpathSection } from "../features/properties-panel/components/ToolpathSection";
import { LayersHeader } from "../features/properties-panel/components/LayersHeader";
import { EmptyState } from "../features/properties-panel/components/EmptyState";
import { ImportsByGroupList } from "../features/properties-panel/components/ImportsByGroupList";
import { useAddLayerGroup } from "../features/properties-panel/hooks/useAddLayerGroup";
import { useInspectorInteractionState } from "../features/properties-panel/hooks/useInspectorInteractionState";
import { useImportDragDrop } from "../features/properties-panel/hooks/useImportDragDrop";
import { usePanelExpansionState } from "../features/properties-panel/hooks/usePanelExpansionState";
import { usePanelNameEditing } from "../features/properties-panel/hooks/usePanelNameEditing";
import { usePropertiesPanelDerivedData } from "../features/properties-panel/hooks/usePropertiesPanelDerivedData";
import { useSyncedStrokeWidth } from "../features/properties-panel/hooks/useSyncedStrokeWidth";

export function PropertiesPanel() {
  // ── Store subscriptions ─────────────────────────────────────────────────
  // All canvas and machine store state/actions needed by this panel.
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
  // Computes isJobActive, bed dimensions, feedrate fallback, toolpath file
  // name, and a helper function that maps an import id to its group id.
  const {
    importGroupId,
    isJobActive,
    fallbackFeedrate,
    bedW,
    bedH,
    toolpathFileName,
  } = usePropertiesPanelDerivedData({
    layerGroups,
    machineStatus,
    activeConfig,
    gcodeSource,
  });

  // ── Expansion / collapse state ───────────────────────────────────────────
  // Tracks which import rows are expanded, which layer groups are collapsed,
  // and which per-import layer sections are open.
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
  // Owns local UI state for the import inspector: rotation step, step-picker
  // flyout visibility, W/H ratio lock, and template-align mode + target.
  const {
    rotStep,
    stepFlyoutOpen,
    ratioLocked,
    templateAlignEnabled,
    templateAlignTarget,
    setRatioLocked,
    setTemplateAlignEnabled,
    setTemplateAlignTarget,
    toggleStepFlyout,
    closeStepFlyout,
    selectRotStep,
  } = useInspectorInteractionState();

  // ── Drag-and-drop ────────────────────────────────────────────────────────
  // Handles dragging imports between layer groups and into the ungrouped zone.
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
  // Manages the double-click-to-rename flow for both imports and layer groups.
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
  // When a stroke width changes on one import, propagates the value to all
  // siblings in the same layer group (or all ungrouped imports if ungrouped).
  const syncStrokeWidth = useSyncedStrokeWidth({
    imports,
    layerGroups,
    importGroupId,
    updateImport,
  });

  // ── Add layer group ──────────────────────────────────────────────────────
  // Returns a callback that creates a new named + coloured layer group.
  const handleAddLayerGroup = useAddLayerGroup({
    groupCount: layerGroups.length,
    addLayerGroup,
  });

  return (
    <PanelContainer>
      {/* Fixed heading strip */}
      <PanelHeading />

      {/* Scrollable content below the heading */}
      <PanelScrollBody>
        {imports.length === 0 && !gcodeToolpath ? (
          // Nothing loaded yet
          <EmptyState message="No objects. Import an SVG." />
        ) : (
          <>
            {/* G-code toolpath row — shown when a .gcode file has been loaded */}
            {gcodeToolpath && (
              <ToolpathSection
                toolpath={gcodeToolpath}
                fileName={toolpathFileName}
                selected={toolpathSelected}
                isJobActive={isJobActive}
                fallbackFeedrate={fallbackFeedrate}
                onToggleSelected={() => selectToolpath(!toolpathSelected)}
                onClear={() => setGcodeToolpath(null)}
              />
            )}

            {/* "Layers" section heading + add-group button */}
            <LayersHeader
              show={imports.length > 0}
              onAddGroup={handleAddLayerGroup}
            />

            {/* All imports, organised into collapsible layer groups.
                Each import row expands to show its inspector (position,
                dimensions, rotation, stroke, hatch, alignment). */}
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
                pageTemplate={pageTemplate}
                pageSizes={pageSizes}
                templateAlignEnabled={templateAlignEnabled}
                templateAlignTarget={templateAlignTarget}
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
    </PanelContainer>
  );
}
