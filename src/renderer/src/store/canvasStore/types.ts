import type { StateCreator } from "zustand";
import type {
  SvgImport,
  SvgPath,
  VectorObject,
  LayerGroup,
  PageSize,
  PageTemplate,
} from "../../../../types";
import type { GcodeToolpath } from "../../utils/gcodeParser";

export interface ImportSlice {
  imports: SvgImport[];
  addImport: (imp: SvgImport) => void;
  removeImport: (id: string) => void;
  updateImport: (id: string, patch: Partial<SvgImport>) => void;
  updatePath: (
    importId: string,
    pathId: string,
    patch: Partial<SvgPath>,
  ) => void;
  updateImportLayer: (
    importId: string,
    layerId: string,
    visible: boolean,
  ) => void;
  removePath: (importId: string, pathId: string) => void;
  clearImports: () => void;
  loadLayout: (
    imports: SvgImport[],
    layerGroups?: LayerGroup[],
    pageTemplate?: PageTemplate | null,
  ) => void;
  selectedImport: () => SvgImport | undefined;
  toVectorObjects: () => VectorObject[];
  applyHatch: (
    importId: string,
    spacingMM: number,
    angleDeg: number,
    enabled: boolean,
  ) => void;
}

export interface SelectionSlice {
  selectedImportId: string | null;
  selectedPathId: string | null;
  allImportsSelected: boolean;
  toolpathSelected: boolean;
  selectedGroupId: string | null;
  selectImport: (id: string | null) => void;
  selectToolpath: (selected: boolean) => void;
  selectGroup: (id: string | null) => void;
}

export interface ClipboardSlice {
  clipboardImport: SvgImport | null;
  copyImport: (id: string) => void;
  cutImport: (id: string) => void;
  pasteImport: () => void;
  selectAllImports: () => void;
}

export interface UndoRedoSlice {
  undoStack: SvgImport[][];
  redoStack: SvgImport[][];
  undo: () => void;
  redo: () => void;
  snapshotForGesture: () => void;
  commitGesture: () => void;
}

export interface ToolpathSlice {
  gcodeToolpath: GcodeToolpath | null;
  gcodeSource: {
    path: string;
    name: string;
    source: "local" | "fs" | "sd";
  } | null;
  showCentreMarker: boolean;
  plotProgressCuts: string;
  plotProgressRapids: string;
  gcodePreviewLoading: boolean;
  setGcodeToolpath: (tp: GcodeToolpath | null) => void;
  setGcodeSource: (
    src: { path: string; name: string; source: "local" | "fs" | "sd" } | null,
  ) => void;
  toggleCentreMarker: () => void;
  setGcodePreviewLoading: (loading: boolean) => void;
  setPlotProgress: (cuts: string, rapids: string) => void;
  clearPlotProgress: () => void;
}

export interface PageTemplateSlice {
  pageTemplate: PageTemplate | null;
  setPageTemplate: (t: PageTemplate | null) => void;
  pageSizes: PageSize[];
  setPageSizes: (sizes: PageSize[]) => void;
}

export interface LayerGroupSlice {
  layerGroups: LayerGroup[];
  addLayerGroup: (name: string, color: string) => void;
  removeLayerGroup: (id: string) => void;
  updateLayerGroup: (
    id: string,
    patch: Partial<Pick<LayerGroup, "name" | "color">>,
  ) => void;
  assignImportToGroup: (importId: string, groupId: string | null) => void;
  toVectorObjectsForGroup: (groupId: string) => VectorObject[];
  toVectorObjectsUngrouped: () => VectorObject[];
}

export interface CanvasState
  extends
    ImportSlice,
    SelectionSlice,
    ClipboardSlice,
    UndoRedoSlice,
    ToolpathSlice,
    PageTemplateSlice,
    LayerGroupSlice {}

export type CanvasStateCreator<T> = StateCreator<
  CanvasState,
  [["zustand/immer", never]],
  [],
  T
>;
