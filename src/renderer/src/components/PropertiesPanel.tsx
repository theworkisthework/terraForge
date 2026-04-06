// Portions of SVG icon data (rotate-ccw, rotate-cw, magnet, chevron-down, maximize-2, minimize-2, lock, unlock) and Lucide React icons (align-horizontal-justify-start/center/end, align-vertical-justify-start/center/end) from Lucide (https://lucide.dev)
// ISC License
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of
// Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
// Permission to use, copy, modify, and/or distribute this software for any purpose
// with or without fee is hereby granted, provided that the above copyright notice
// and this permission notice appear in all copies.
import { useState } from "react";
import { DimensionsRow } from "../features/properties-panel/components/DimensionsRow";
import { useCanvasStore } from "../store/canvasStore";
import { useMachineStore } from "../store/machineStore";
import {
  DEFAULT_HATCH_ANGLE_DEG,
  DEFAULT_HATCH_SPACING_MM,
  DEFAULT_STROKE_WIDTH_MM,
} from "../../../types";
import { ToolpathSection } from "../features/properties-panel/components/ToolpathSection";
import { LayersHeader } from "../features/properties-panel/components/LayersHeader";
import { NumberField } from "../features/properties-panel/components/NumberField";
import { EmptyState } from "../features/properties-panel/components/EmptyState";
import { ImportPathsList } from "../features/properties-panel/components/ImportPathsList";
import { ImportHeaderRow } from "../features/properties-panel/components/ImportHeaderRow";
import { GroupHeaderRow } from "../features/properties-panel/components/GroupHeaderRow";
import { UngroupedDropZone } from "../features/properties-panel/components/UngroupedDropZone";
import { EmptyGroupDropHint } from "../features/properties-panel/components/EmptyGroupDropHint";
import { HatchFillSection } from "../features/properties-panel/components/HatchFillSection";
import { AlignmentControls } from "../features/properties-panel/components/AlignmentControls";
import { TransformShortcuts } from "../features/properties-panel/components/TransformShortcuts";
import { StrokeWidthSection } from "../features/properties-panel/components/StrokeWidthSection";
import { useImportDragDrop } from "../features/properties-panel/hooks/useImportDragDrop";
import { usePanelNameEditing } from "../features/properties-panel/hooks/usePanelNameEditing";
import {
  ROT_PRESETS,
  ROT_STEPS,
  type RotStep,
} from "../features/properties-panel/utils/rotation";

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
  const fallbackFeedrate = activeConfig()?.feedrate ?? 300;
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

  const GROUP_COLORS = [
    "#e94560",
    "#0ea5e9",
    "#22c55e",
    "#f59e0b",
    "#a855f7",
    "#ec4899",
    "#14b8a6",
    "#f97316",
  ];

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
              onAddGroup={() => {
                const n = layerGroups.length + 1;
                addLayerGroup(
                  `Group ${n}`,
                  GROUP_COLORS[layerGroups.length % GROUP_COLORS.length],
                );
              }}
            />

            {/* ── Layer groups (collapsible) + ungrouped imports ──────── */}
            {imports.length > 0 &&
              (() => {
                const ungroupedImports = imports.filter(
                  (i) => !layerGroups.some((g) => g.importIds.includes(i.id)),
                );

                /** Renders a single import row (used both in groups and ungrouped). */
                const renderImport = (
                  imp: (typeof imports)[0],
                  indented: boolean,
                ) => {
                  const isSelected = imp.id === selectedImportId;
                  const isExpanded = expandedIds.has(imp.id);
                  const groupId = importGroupId(imp.id);
                  const groupColor =
                    layerGroups.find((g) => g.id === groupId)?.color ?? null;

                  return (
                    <div
                      key={imp.id}
                      className={`border-b border-border-ui/20 ${isSelected ? "bg-secondary/20" : ""} ${draggingImportId === imp.id ? "opacity-40" : ""}`}
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
                        isEditingName={editingName?.id === imp.id}
                        editingNameValue={
                          editingName?.id === imp.id
                            ? editingName.value
                            : imp.name
                        }
                        onSelectImport={selectImport}
                        onToggleExpand={toggleExpand}
                        onToggleVisibility={(importId, visible) =>
                          updateImport(importId, { visible })
                        }
                        onStartRename={startImportRename}
                        onEditingNameChange={changeImportRename}
                        onCommitName={commitImportRename}
                        onCancelName={cancelImportRename}
                        onDeleteImport={removeImport}
                        onDragStart={handleImportDragStart}
                        onDragEnd={handleImportDragEnd}
                      />

                      {/* Expanded path / layer list */}
                      {isExpanded && (
                        <ImportPathsList
                          imp={imp}
                          expandedLayerKeys={expandedLayerKeys}
                          onSelectImport={selectImport}
                          onToggleLayerCollapse={toggleLayerCollapse}
                          onUpdateLayerVisibility={(
                            importId,
                            layerId,
                            visible,
                          ) => updateImportLayer(importId, layerId, visible)}
                          onUpdatePathVisibility={(importId, pathId, visible) =>
                            updatePath(importId, pathId, { visible })
                          }
                          onRemovePath={removePath}
                        />
                      )}

                      {/* Properties form — shown when import is selected */}
                      {isSelected && (
                        <div
                          className="px-3 pb-3 pt-2 border-t border-border-ui/30"
                          onDragStart={(e) => e.stopPropagation()}
                        >
                          {(() => {
                            const objW =
                              imp.svgWidth * (imp.scaleX ?? imp.scale);
                            const objH =
                              imp.svgHeight * (imp.scaleY ?? imp.scale);
                            const cfg = activeConfig();
                            const bedW = cfg?.bedWidth ?? 220;
                            const bedH = cfg?.bedHeight ?? 200;
                            const activePageSize = pageTemplate
                              ? pageSizes.find(
                                  (ps) => ps.id === pageTemplate.sizeId,
                                )
                              : null;
                            const canAlignToTemplate =
                              !!pageTemplate && !!activePageSize;
                            return (
                              <>
                                {/* X / Y — two columns (unconstrained: G-code clips to bed) */}
                                <div className="grid grid-cols-2 gap-2 mb-0">
                                  <NumberField
                                    label="X (mm)"
                                    value={imp.x}
                                    onChange={(v) =>
                                      updateImport(imp.id, { x: v })
                                    }
                                    step={0.5}
                                  />
                                  <NumberField
                                    label="Y (mm)"
                                    value={imp.y}
                                    onChange={(v) =>
                                      updateImport(imp.id, { y: v })
                                    }
                                    step={0.5}
                                  />
                                </div>

                                <AlignmentControls
                                  objW={objW}
                                  objH={objH}
                                  bedW={bedW}
                                  bedH={bedH}
                                  pageW={
                                    activePageSize
                                      ? pageTemplate!.landscape
                                        ? activePageSize.heightMM
                                        : activePageSize.widthMM
                                      : bedW
                                  }
                                  pageH={
                                    activePageSize
                                      ? pageTemplate!.landscape
                                        ? activePageSize.widthMM
                                        : activePageSize.heightMM
                                      : bedH
                                  }
                                  marginMM={pageTemplate?.marginMM ?? 20}
                                  canAlignToTemplate={canAlignToTemplate}
                                  templateAlignEnabled={templateAlignEnabled}
                                  templateAlignTarget={templateAlignTarget}
                                  onTemplateAlignEnabledChange={
                                    setTemplateAlignEnabled
                                  }
                                  onTemplateAlignTargetChange={
                                    setTemplateAlignTarget
                                  }
                                  onAlignX={(x) =>
                                    updateImport(imp.id, {
                                      x: Math.round(x * 1000) / 1000,
                                    })
                                  }
                                  onAlignY={(y) =>
                                    updateImport(imp.id, {
                                      y: Math.round(y * 1000) / 1000,
                                    })
                                  }
                                />

                                <DimensionsRow
                                  objW={objW}
                                  objH={objH}
                                  svgWidth={imp.svgWidth}
                                  svgHeight={imp.svgHeight}
                                  ratioLocked={ratioLocked}
                                  currentScaleX={imp.scaleX ?? imp.scale}
                                  currentScaleY={imp.scaleY ?? imp.scale}
                                  onUpdate={(changes) =>
                                    updateImport(imp.id, changes)
                                  }
                                  onRatioLockedChange={setRatioLocked}
                                />
                                {/* Scale — full width */}
                                <NumberField
                                  label="Scale"
                                  value={imp.scale}
                                  onChange={(v) =>
                                    updateImport(imp.id, {
                                      scale: Math.max(0.001, v),
                                    })
                                  }
                                  step={0.05}
                                  min={0.001}
                                />
                                <TransformShortcuts
                                  fitScale={Math.min(
                                    bedW / (imp.svgWidth || 1),
                                    bedH / (imp.svgHeight || 1),
                                  )}
                                  rotStep={rotStep}
                                  rotSteps={ROT_STEPS}
                                  stepFlyoutOpen={stepFlyoutOpen}
                                  showCentreMarker={showCentreMarker}
                                  snapPresetTitle={`Snap to next preset (${ROT_PRESETS.join("° · ")}°)`}
                                  showRotationRow={false}
                                  onFitToBed={() => {
                                    const fitScale = Math.min(
                                      bedW / (imp.svgWidth || 1),
                                      bedH / (imp.svgHeight || 1),
                                    );
                                    setRatioLocked(true);
                                    updateImport(imp.id, {
                                      scale: fitScale,
                                      scaleX: undefined,
                                      scaleY: undefined,
                                      x: 0,
                                      y: 0,
                                    });
                                  }}
                                  onResetScale={() => {
                                    setRatioLocked(true);
                                    updateImport(imp.id, {
                                      scale: 1,
                                      scaleX: undefined,
                                      scaleY: undefined,
                                    });
                                  }}
                                  onRotateCcw={() =>
                                    updateImport(imp.id, {
                                      rotation: imp.rotation - rotStep,
                                    })
                                  }
                                  onRotateCw={() =>
                                    updateImport(imp.id, {
                                      rotation: imp.rotation + rotStep,
                                    })
                                  }
                                  onToggleStepFlyout={() =>
                                    setStepFlyoutOpen((o) => !o)
                                  }
                                  onCloseStepFlyout={() =>
                                    setStepFlyoutOpen(false)
                                  }
                                  onSelectRotStep={(s) => {
                                    setRotStep(s);
                                    setStepFlyoutOpen(false);
                                  }}
                                  onToggleCentreMarker={toggleCentreMarker}
                                  onSnapToNextPreset={() => {
                                    const norm =
                                      ((imp.rotation % 360) + 360) % 360;
                                    const idx = ROT_PRESETS.findIndex(
                                      (p) => Math.abs(p - norm) < 1,
                                    );
                                    const next =
                                      ROT_PRESETS[
                                        idx < 0
                                          ? 0
                                          : (idx + 1) % ROT_PRESETS.length
                                      ];
                                    updateImport(imp.id, { rotation: next });
                                  }}
                                />
                                {/* Rotation — full width */}
                                <NumberField
                                  label="Rotation (°)"
                                  value={imp.rotation}
                                  onChange={(v) =>
                                    updateImport(imp.id, { rotation: v })
                                  }
                                  step={1}
                                />
                                <TransformShortcuts
                                  fitScale={Math.min(
                                    bedW / (imp.svgWidth || 1),
                                    bedH / (imp.svgHeight || 1),
                                  )}
                                  rotStep={rotStep}
                                  rotSteps={ROT_STEPS}
                                  stepFlyoutOpen={stepFlyoutOpen}
                                  showCentreMarker={showCentreMarker}
                                  snapPresetTitle={`Snap to next preset (${ROT_PRESETS.join("° · ")}°)`}
                                  showScaleRow={false}
                                  onFitToBed={() => {
                                    const fitScale = Math.min(
                                      bedW / (imp.svgWidth || 1),
                                      bedH / (imp.svgHeight || 1),
                                    );
                                    setRatioLocked(true);
                                    updateImport(imp.id, {
                                      scale: fitScale,
                                      scaleX: undefined,
                                      scaleY: undefined,
                                      x: 0,
                                      y: 0,
                                    });
                                  }}
                                  onResetScale={() => {
                                    setRatioLocked(true);
                                    updateImport(imp.id, {
                                      scale: 1,
                                      scaleX: undefined,
                                      scaleY: undefined,
                                    });
                                  }}
                                  onRotateCcw={() =>
                                    updateImport(imp.id, {
                                      rotation: imp.rotation - rotStep,
                                    })
                                  }
                                  onRotateCw={() =>
                                    updateImport(imp.id, {
                                      rotation: imp.rotation + rotStep,
                                    })
                                  }
                                  onToggleStepFlyout={() =>
                                    setStepFlyoutOpen((o) => !o)
                                  }
                                  onCloseStepFlyout={() =>
                                    setStepFlyoutOpen(false)
                                  }
                                  onSelectRotStep={(s) => {
                                    setRotStep(s);
                                    setStepFlyoutOpen(false);
                                  }}
                                  onToggleCentreMarker={toggleCentreMarker}
                                  onSnapToNextPreset={() => {
                                    const norm =
                                      ((imp.rotation % 360) + 360) % 360;
                                    const idx = ROT_PRESETS.findIndex(
                                      (p) => Math.abs(p - norm) < 1,
                                    );
                                    const next =
                                      ROT_PRESETS[
                                        idx < 0
                                          ? 0
                                          : (idx + 1) % ROT_PRESETS.length
                                      ];
                                    updateImport(imp.id, { rotation: next });
                                  }}
                                />
                                <StrokeWidthSection
                                  strokeWidthMM={imp.strokeWidthMM}
                                  defaultStrokeWidthMM={DEFAULT_STROKE_WIDTH_MM}
                                  onChangeStrokeWidth={(value) =>
                                    syncStrokeWidth(imp.id, value)
                                  }
                                />

                                <HatchFillSection
                                  imp={imp}
                                  defaultSpacingMM={DEFAULT_HATCH_SPACING_MM}
                                  defaultAngleDeg={DEFAULT_HATCH_ANGLE_DEG}
                                  onApplyHatch={applyHatch}
                                />
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                }; // end renderImport

                return (
                  <>
                    {/* Grouped imports — one collapsible section per group */}
                    {layerGroups.map((group) => {
                      const members = group.importIds
                        .map((id) => imports.find((i) => i.id === id))
                        .filter(Boolean) as (typeof imports)[0][];
                      const isCollapsed = collapsedGroupIds.has(group.id);
                      const isDropTarget = dragOverGroupId === group.id;

                      return (
                        <div
                          key={group.id}
                          className="border-b border-border-ui/40"
                        >
                          <GroupHeaderRow
                            group={group}
                            isCollapsed={isCollapsed}
                            isDropTarget={isDropTarget}
                            isSelected={selectedGroupId === group.id}
                            membersCount={members.length}
                            isEditingName={editingGroupName?.id === group.id}
                            editingNameValue={
                              editingGroupName?.id === group.id
                                ? editingGroupName.value
                                : group.name
                            }
                            onToggleSelect={(groupId) =>
                              selectGroup(
                                selectedGroupId === groupId ? null : groupId,
                              )
                            }
                            onDragOverGroup={handleGroupDragOver}
                            onDragLeaveGroup={handleGroupDragLeave}
                            onDropGroup={handleGroupDrop}
                            onToggleCollapse={toggleGroupCollapse}
                            onUpdateGroupColor={(groupId, color) =>
                              updateLayerGroup(groupId, { color })
                            }
                            onStartEditName={startGroupRename}
                            onEditingNameChange={changeGroupRename}
                            onCommitName={(groupId, nextValue) =>
                              commitGroupRename(groupId, nextValue, group.name)
                            }
                            onCancelEditName={cancelGroupRename}
                            onRemoveGroup={removeLayerGroup}
                          />

                          {/* Members (indented), hidden when collapsed */}
                          {!isCollapsed && (
                            <div>
                              {members.map((imp) => renderImport(imp, true))}
                              {/* Drop hint when group is empty */}
                              {members.length === 0 && (
                                <EmptyGroupDropHint
                                  isDropTarget={isDropTarget}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Ungrouped imports + ungroup drop zone */}
                    <UngroupedDropZone
                      isDropTarget={dragOverGroupId === "none"}
                      showHint={showUngroupedHint}
                      onDragOver={handleUngroupedDragOver}
                      onDragLeave={handleUngroupedDragLeave}
                      onDrop={handleUngroupedDrop}
                    >
                      {ungroupedImports.map((imp) => renderImport(imp, false))}
                    </UngroupedDropZone>
                  </>
                );
              })()}
          </>
        )}
      </div>
    </div>
  );
}
