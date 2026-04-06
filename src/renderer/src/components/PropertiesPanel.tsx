// Portions of SVG icon data (rotate-ccw, rotate-cw, magnet, chevron-down, maximize-2, minimize-2, lock, unlock) and Lucide React icons (align-horizontal-justify-start/center/end, align-vertical-justify-start/center/end) from Lucide (https://lucide.dev)
// ISC License
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of
// Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
// Permission to use, copy, modify, and/or distribute this software for any purpose
// with or without fee is hereby granted, provided that the above copyright notice
// and this permission notice appear in all copies.
import { useState } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { useMachineStore } from "../store/machineStore";
import { ToolpathSection } from "../features/properties-panel/components/ToolpathSection";
import { LayersHeader } from "../features/properties-panel/components/LayersHeader";
import { EmptyState } from "../features/properties-panel/components/EmptyState";
import { ImportsByGroupList } from "../features/properties-panel/components/ImportsByGroupList";
import { useAddLayerGroup } from "../features/properties-panel/hooks/useAddLayerGroup";
import { useImportDragDrop } from "../features/properties-panel/hooks/useImportDragDrop";
import { usePanelNameEditing } from "../features/properties-panel/hooks/usePanelNameEditing";
import { type RotStep } from "../features/properties-panel/utils/rotation";

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

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    new Set(),
  );
  // Sub-layers within an import are collapsed by default; key = "importId:layerId"
  const [expandedLayerKeys, setExpandedLayerKeys] = useState<Set<string>>(
    new Set(),
  );
  const toggleLayerCollapse = (importId: string, layerId: string) => {
    const key = `${importId}:${layerId}`;
    setExpandedLayerKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const [rotStep, setRotStep] = useState<RotStep>(45);

  const toggleGroupCollapse = (id: string) =>
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const [stepFlyoutOpen, setStepFlyoutOpen] = useState(false);
  const [ratioLocked, setRatioLocked] = useState(true);
  const [templateAlignEnabled, setTemplateAlignEnabled] = useState(false);
  const [templateAlignTarget, setTemplateAlignTarget] = useState<
    "page" | "margin"
  >("page");

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

  /**
   * Set strokeWidthMM on all imports that share the same "pen group" as the
   * changed import.  If it belongs to a LayerGroup, all members get the same
   * value.  If it is ungrouped, all other ungrouped imports are synced too.
   */
  const syncStrokeWidth = (changedId: string, widthMM: number) => {
    const groupId = importGroupId(changedId);
    const siblings = groupId
      ? (layerGroups.find((g) => g.id === groupId)?.importIds ?? [])
      : imports
          .filter((imp) => importGroupId(imp.id) === null)
          .map((imp) => imp.id);
    for (const id of siblings) {
      updateImport(id, { strokeWidthMM: widthMM });
    }
  };

  const handleAddLayerGroup = useAddLayerGroup({
    groupCount: layerGroups.length,
    addLayerGroup,
  });

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
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
                onToggleStepFlyout={() => setStepFlyoutOpen((o) => !o)}
                onCloseStepFlyout={() => setStepFlyoutOpen(false)}
                onSelectRotStep={(s) => {
                  setRotStep(s);
                  setStepFlyoutOpen(false);
                }}
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
