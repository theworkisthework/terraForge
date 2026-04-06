import type { DragEvent } from "react";
import type {
  LayerGroup,
  PageSize,
  PageTemplate,
  SvgImport,
} from "../../../../../types";
import { useImportRowRenderer } from "../hooks/useImportRowRenderer";
import { resolvePageBounds } from "../utils/pageBounds";
import type { RotStep } from "../utils/rotation";
import { GroupedImportsSection } from "./GroupedImportsSection";
import { UngroupedImportsSection } from "./UngroupedImportsSection";

interface NameEditState {
  id: string;
  value: string;
}

interface ImportsByGroupListProps {
  imports: SvgImport[];
  layerGroups: LayerGroup[];
  selectedImportId: string | null;
  selectedGroupId: string | null;
  expandedIds: Set<string>;
  collapsedGroupIds: Set<string>;
  expandedLayerKeys: Set<string>;
  draggingImportId: string | null;
  dragOverGroupId: string | null;
  showUngroupedHint: boolean;
  bedW: number;
  bedH: number;
  pageTemplate: PageTemplate | null;
  pageSizes: PageSize[];
  templateAlignEnabled: boolean;
  templateAlignTarget: "page" | "margin";
  ratioLocked: boolean;
  rotStep: RotStep;
  stepFlyoutOpen: boolean;
  showCentreMarker: boolean;
  editingName: NameEditState | null;
  editingGroupName: NameEditState | null;
  importGroupId: (importId: string) => string | null;
  onSelectImport: (importId: string | null) => void;
  onSelectGroup: (groupId: string | null) => void;
  onToggleExpand: (importId: string) => void;
  onToggleGroupCollapse: (groupId: string) => void;
  onToggleLayerCollapse: (importId: string, layerId: string) => void;
  onUpdateImport: (importId: string, changes: Partial<SvgImport>) => void;
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
  onUpdateLayerGroup: (
    groupId: string,
    changes: Partial<{ name: string; color: string }>,
  ) => void;
  onRemoveImport: (importId: string) => void;
  onRemovePath: (importId: string, pathId: string) => void;
  onRemoveLayerGroup: (groupId: string) => void;
  onApplyHatch: (
    importId: string,
    spacingMM: number,
    angleDeg: number,
    enabled: boolean,
  ) => void;
  onSyncStrokeWidth: (importId: string, widthMM: number) => void;
  onToggleCentreMarker: () => void;
  onTemplateAlignEnabledChange: (v: boolean) => void;
  onTemplateAlignTargetChange: (v: "page" | "margin") => void;
  onRatioLockedChange: (v: boolean) => void;
  onToggleStepFlyout: () => void;
  onCloseStepFlyout: () => void;
  onSelectRotStep: (s: RotStep) => void;
  onImportDragStart: (
    event: DragEvent<HTMLSpanElement>,
    importId: string,
  ) => void;
  onImportDragEnd: () => void;
  onGroupDragOver: (event: DragEvent<HTMLDivElement>, groupId: string) => void;
  onGroupDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onGroupDrop: (event: DragEvent<HTMLDivElement>, groupId: string) => void;
  onUngroupedDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onUngroupedDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onUngroupedDrop: (event: DragEvent<HTMLDivElement>) => void;
  onStartImportRename: (importId: string, currentName: string) => void;
  onChangeImportRename: (nextValue: string) => void;
  onCommitImportRename: (importId: string, nextName: string) => void;
  onCancelImportRename: () => void;
  onStartGroupRename: (groupId: string, currentName: string) => void;
  onChangeGroupRename: (nextValue: string) => void;
  onCommitGroupRename: (
    groupId: string,
    nextName: string,
    fallbackName: string,
  ) => void;
  onCancelGroupRename: () => void;
}

export function ImportsByGroupList({
  imports,
  layerGroups,
  selectedImportId,
  selectedGroupId,
  expandedIds,
  collapsedGroupIds,
  expandedLayerKeys,
  draggingImportId,
  dragOverGroupId,
  showUngroupedHint,
  bedW,
  bedH,
  pageTemplate,
  pageSizes,
  templateAlignEnabled,
  templateAlignTarget,
  ratioLocked,
  rotStep,
  stepFlyoutOpen,
  showCentreMarker,
  editingName,
  editingGroupName,
  importGroupId,
  onSelectImport,
  onSelectGroup,
  onToggleExpand,
  onToggleGroupCollapse,
  onToggleLayerCollapse,
  onUpdateImport,
  onUpdateImportLayer,
  onUpdatePath,
  onUpdateLayerGroup,
  onRemoveImport,
  onRemovePath,
  onRemoveLayerGroup,
  onApplyHatch,
  onSyncStrokeWidth,
  onToggleCentreMarker,
  onTemplateAlignEnabledChange,
  onTemplateAlignTargetChange,
  onRatioLockedChange,
  onToggleStepFlyout,
  onCloseStepFlyout,
  onSelectRotStep,
  onImportDragStart,
  onImportDragEnd,
  onGroupDragOver,
  onGroupDragLeave,
  onGroupDrop,
  onUngroupedDragOver,
  onUngroupedDragLeave,
  onUngroupedDrop,
  onStartImportRename,
  onChangeImportRename,
  onCommitImportRename,
  onCancelImportRename,
  onStartGroupRename,
  onChangeGroupRename,
  onCommitGroupRename,
  onCancelGroupRename,
}: ImportsByGroupListProps) {
  const { pageW, pageH, canAlignToTemplate, marginMM } = resolvePageBounds({
    bedW,
    bedH,
    pageTemplate,
    pageSizes,
  });

  const renderImport = useImportRowRenderer({
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
    onRatioLockedChange,
    onToggleStepFlyout,
    onCloseStepFlyout,
    onSelectRotStep,
    onToggleCentreMarker,
    onSyncStrokeWidth,
    onApplyHatch,
  });

  return (
    <>
      <GroupedImportsSection
        layerGroups={layerGroups}
        imports={imports}
        collapsedGroupIds={collapsedGroupIds}
        dragOverGroupId={dragOverGroupId}
        selectedGroupId={selectedGroupId}
        editingGroupName={editingGroupName}
        onSelectGroup={onSelectGroup}
        onGroupDragOver={onGroupDragOver}
        onGroupDragLeave={onGroupDragLeave}
        onGroupDrop={onGroupDrop}
        onToggleGroupCollapse={onToggleGroupCollapse}
        onUpdateLayerGroup={onUpdateLayerGroup}
        onStartGroupRename={onStartGroupRename}
        onChangeGroupRename={onChangeGroupRename}
        onCommitGroupRename={onCommitGroupRename}
        onCancelGroupRename={onCancelGroupRename}
        onRemoveLayerGroup={onRemoveLayerGroup}
        renderImport={renderImport}
      />

      <UngroupedImportsSection
        imports={imports}
        layerGroups={layerGroups}
        dragOverGroupId={dragOverGroupId}
        showUngroupedHint={showUngroupedHint}
        onUngroupedDragOver={onUngroupedDragOver}
        onUngroupedDragLeave={onUngroupedDragLeave}
        onUngroupedDrop={onUngroupedDrop}
        renderImport={renderImport}
      />
    </>
  );
}
