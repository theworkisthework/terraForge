// Portions of SVG icon data (rotate-ccw, rotate-cw, magnet, chevron-down, maximize-2, minimize-2, lock, unlock) and Lucide React icons (align-horizontal-justify-start/center/end, align-vertical-justify-start/center/end) from Lucide (https://lucide.dev)
// ISC License
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of
// Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
// Permission to use, copy, modify, and/or distribute this software for any purpose
// with or without fee is hereby granted, provided that the above copyright notice
// and this permission notice appear in all copies.
import { useCanvasStore } from "../store/canvasStore";
import { useMachineStore } from "../store/machineStore";
import { ToolpathSection } from "../features/properties-panel/components/ToolpathSection";
import { LayersHeader } from "../features/properties-panel/components/LayersHeader";
import { EmptyState } from "../features/properties-panel/components/EmptyState";
import { ImportsByGroupList } from "../features/properties-panel/components/ImportsByGroupList";
import { useAddLayerGroup } from "../features/properties-panel/hooks/useAddLayerGroup";
import { useInspectorInteractionState } from "../features/properties-panel/hooks/useInspectorInteractionState";
import { useImportDragDrop } from "../features/properties-panel/hooks/useImportDragDrop";
import { usePanelExpansionState } from "../features/properties-panel/hooks/usePanelExpansionState";
import { usePanelNameEditing } from "../features/properties-panel/hooks/usePanelNameEditing";
import { useSyncedStrokeWidth } from "../features/properties-panel/hooks/useSyncedStrokeWidth";

export function PropertiesPanel() {
  const imports = useCanvasStore((s) => s.imports);
  const selectedImportId = useCanvasStore((s) => s.selectedImportId);
  const selectImport = useCanvasStore((s) => s.selectImport);
  const removeImport = useCanvasStore((s) => s.removeImport);
  const updateImport = useCanvasStore((s) => s.updateImport);
  const updatePath = useCanvasStore((s) => s.updatePath);
  const updateImportLayer = useCanvasStore((s) => s.updateImportLayer);
  const removePath = useCanvasStore((s) => s.removePath);
  const applyHatch = useCanvasStore((s) => s.applyHatch);
  const showCentreMarker = useCanvasStore((s) => s.showCentreMarker);
  const toggleCentreMarker = useCanvasStore((s) => s.toggleCentreMarker);
  const gcodeToolpath = useCanvasStore((s) => s.gcodeToolpath);
  const gcodeSource = useCanvasStore((s) => s.gcodeSource);
  const setGcodeToolpath = useCanvasStore((s) => s.setGcodeToolpath);
  const toolpathSelected = useCanvasStore((s) => s.toolpathSelected);
  const selectToolpath = useCanvasStore((s) => s.selectToolpath);
  const layerGroups = useCanvasStore((s) => s.layerGroups);
  const addLayerGroup = useCanvasStore((s) => s.addLayerGroup);
  const removeLayerGroup = useCanvasStore((s) => s.removeLayerGroup);
  const updateLayerGroup = useCanvasStore((s) => s.updateLayerGroup);
  const assignImportToGroup = useCanvasStore((s) => s.assignImportToGroup);
  const selectedGroupId = useCanvasStore((s) => s.selectedGroupId);
  const selectGroup = useCanvasStore((s) => s.selectGroup);
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const machineStatus = useMachineStore((s) => s.status);
  const pageTemplate = useCanvasStore((s) => s.pageTemplate);
  const pageSizes = useCanvasStore((s) => s.pageSizes);
  const isJobActive =
    machineStatus?.state === "Run" || machineStatus?.state === "Hold";
  const cfg = activeConfig();
  const fallbackFeedrate = cfg?.feedrate ?? 300;
  const bedW = cfg?.bedWidth ?? 220;
  const bedH = cfg?.bedHeight ?? 200;
  const toolpathFileName = gcodeSource?.name ?? "G-code toolpath";

  const {
    expandedIds,
    collapsedGroupIds,
    expandedLayerKeys,
    setCollapsedGroupIds,
    toggleExpand,
    toggleGroupCollapse,
    toggleLayerCollapse,
  } = usePanelExpansionState();
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

  /** Returns the group id that the given import belongs to, or null. */
  const importGroupId = (importId: string): string | null =>
    layerGroups.find((g) => g.importIds.includes(importId))?.id ?? null;

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

  const syncStrokeWidth = useSyncedStrokeWidth({
    imports,
    layerGroups,
    importGroupId,
    updateImport,
  });

  const handleAddLayerGroup = useAddLayerGroup({
    groupCount: layerGroups.length,
    addLayerGroup,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border-ui shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-content-muted">
          Properties
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {imports.length === 0 && !gcodeToolpath ? (
          <EmptyState message="No objects. Import an SVG." />
        ) : (
          <>
            {/* ── G-code toolpath entry ──────────────────────────────── */}
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

            <LayersHeader
              show={imports.length > 0}
              onAddGroup={handleAddLayerGroup}
            />

            {/* ── Layer groups (collapsible) + ungrouped imports ──────── */}
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
      </div>
    </div>
  );
}
