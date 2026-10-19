import { usePropertiesPanelStoreBindings } from "../hooks/usePropertiesPanelStoreBindings";
import { PanelScrollBody } from "./PanelScrollBody";
import { ToolpathSection } from "./ToolpathSection";
import { LayersHeader } from "./LayersHeader";
import { EmptyState } from "./EmptyState";
import { ImportsByGroupList } from "./ImportsByGroupList";
import type { ImportsByGroupListProps } from "./ImportsByGroupList.types";
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
type StoreBindings = ReturnType<typeof usePropertiesPanelStoreBindings>;
type DerivedData = ReturnType<typeof usePropertiesPanelDerivedData>;

/**
 * Everything the imports list needs: the panel's expansion, inspector,
 * drag-and-drop, renaming and stroke-width hooks, wired to the store.
 */
function useImportsListProps(store: StoreBindings, derived: DerivedData): ImportsByGroupListProps {
  const expansion = usePanelExpansionState();
  const inspector = useInspectorInteractionState();
  const dragDrop = useImportDragDrop({
    assignImportToGroup: store.assignImportToGroup,
    importGroupId: derived.importGroupId,
    setCollapsedGroupIds: expansion.setCollapsedGroupIds,
  });
  const naming = usePanelNameEditing({ updateImport: store.updateImport, updateLayerGroup: store.updateLayerGroup });
  const syncStrokeWidth = useSyncedStrokeWidth({
    imports: store.imports,
    layerGroups: store.layerGroups,
    importGroupId: derived.importGroupId,
    updateImport: store.updateImport,
  });

  return {
    imports: store.imports,
    layerGroups: store.layerGroups,
    selectedImportId: store.selectedImportId,
    selectedGroupId: store.selectedGroupId,
    expandedIds: expansion.expandedIds,
    collapsedGroupIds: expansion.collapsedGroupIds,
    expandedLayerKeys: expansion.expandedLayerKeys,
    draggingImportId: dragDrop.draggingImportId,
    dragOverGroupId: dragDrop.dragOverGroupId,
    showUngroupedHint: dragDrop.showUngroupedHint,
    bedW: derived.bedW,
    bedH: derived.bedH,
    origin: derived.origin,
    pageTemplate: store.pageTemplate,
    pageSizes: store.pageSizes,
    templateAlignEnabled: inspector.templateAlignEnabled,
    templateAlignTarget: inspector.templateAlignTarget,
    templateScaleEnabled: inspector.templateScaleEnabled,
    templateScaleTarget: inspector.templateScaleTarget,
    ratioLocked: inspector.ratioLocked,
    rotStep: inspector.rotStep,
    stepFlyoutOpen: inspector.stepFlyoutOpen,
    showCentreMarker: store.showCentreMarker,
    editingName: naming.editingName,
    editingGroupName: naming.editingGroupName,
    importGroupId: derived.importGroupId,
    onSelectImport: store.selectImport,
    onSelectGroup: store.selectGroup,
    onToggleExpand: expansion.toggleExpand,
    onToggleGroupCollapse: expansion.toggleGroupCollapse,
    onToggleLayerCollapse: expansion.toggleLayerCollapse,
    onUpdateImport: store.updateImport,
    onUpdateImportLayer: store.updateImportLayer,
    onUpdatePath: store.updatePath,
    onUpdateLayerGroup: store.updateLayerGroup,
    onRemoveImport: store.removeImport,
    onRemovePath: store.removePath,
    onRemoveLayerGroup: store.removeLayerGroup,
    onApplyHatch: store.applyHatch,
    onSyncStrokeWidth: syncStrokeWidth,
    onToggleCentreMarker: store.toggleCentreMarker,
    onTemplateAlignEnabledChange: inspector.setTemplateAlignEnabled,
    onTemplateAlignTargetChange: inspector.setTemplateAlignTarget,
    onTemplateScaleEnabledChange: inspector.setTemplateScaleEnabled,
    onTemplateScaleTargetChange: inspector.setTemplateScaleTarget,
    onRatioLockedChange: inspector.setRatioLocked,
    onToggleStepFlyout: inspector.toggleStepFlyout,
    onCloseStepFlyout: inspector.closeStepFlyout,
    onSelectRotStep: inspector.selectRotStep,
    onImportDragStart: dragDrop.handleImportDragStart,
    onImportDragEnd: dragDrop.handleImportDragEnd,
    onGroupDragOver: dragDrop.handleGroupDragOver,
    onGroupDragLeave: dragDrop.handleGroupDragLeave,
    onGroupDrop: dragDrop.handleGroupDrop,
    onUngroupedDragOver: dragDrop.handleUngroupedDragOver,
    onUngroupedDragLeave: dragDrop.handleUngroupedDragLeave,
    onUngroupedDrop: dragDrop.handleUngroupedDrop,
    onStartImportRename: naming.startImportRename,
    onChangeImportRename: naming.changeImportRename,
    onCommitImportRename: naming.commitImportRename,
    onCancelImportRename: naming.cancelImportRename,
    onStartGroupRename: naming.startGroupRename,
    onChangeGroupRename: naming.changeGroupRename,
    onCommitGroupRename: naming.commitGroupRename,
    onCancelGroupRename: naming.cancelGroupRename,
  };
}

export function LayersPanelContent() {
  const store = usePropertiesPanelStoreBindings();
  const derived = usePropertiesPanelDerivedData({
    layerGroups: store.layerGroups,
    machineStatus: store.machineStatus,
    activeConfig: store.activeConfig,
    gcodeSource: store.gcodeSource,
  });
  const listProps = useImportsListProps(store, derived);
  const handleAddLayerGroup = useAddLayerGroup({
    groupCount: store.layerGroups.length,
    addLayerGroup: store.addLayerGroup,
  });
  const { imports, gcodeToolpath, toolpathSelected } = store;

  return (
    <PanelScrollBody>
      {imports.length === 0 && !gcodeToolpath ? (
        <EmptyState message="No objects. Import a vector or bitmap." />
      ) : (
        <>
          {/* G-code section heading + row — shown when a .gcode file has been loaded */}
          {gcodeToolpath && (
            <>
              <div className="flex items-center gap-1 px-2 py-1 border-b border-border-ui/50">
                <span className="text-[10px] text-content-faint uppercase tracking-wider flex-1">
                  GCODE
                </span>
              </div>
              <ToolpathSection
                toolpath={gcodeToolpath}
                fileName={derived.toolpathFileName}
                selected={toolpathSelected}
                visible={store.toolpathVisible}
                colorized={store.toolpathColorized}
                opacity={store.toolpathOpacity}
                isJobActive={derived.isJobActive}
                fallbackFeedrate={derived.fallbackFeedrate}
                onToggleSelected={() => store.selectToolpath(!toolpathSelected)}
                onSetVisible={store.setToolpathVisible}
                onSetColorized={store.setToolpathColorized}
                onSetOpacity={store.setToolpathOpacity}
                onClear={() => store.setGcodeToolpath(null)}
              />
            </>
          )}

          {/* "Layers" section heading + add-group button */}
          <LayersHeader show={imports.length > 0} onAddGroup={handleAddLayerGroup} />

          {/* All imports, organised into collapsible layer groups */}
          {imports.length > 0 && <ImportsByGroupList {...listProps} />}
        </>
      )}
    </PanelScrollBody>
  );
}
