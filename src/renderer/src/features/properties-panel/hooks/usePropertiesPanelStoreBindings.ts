import { useCanvasStore } from "../../../store/canvasStore";
import { useMachineStore } from "../../../store/machineStore";

export function usePropertiesPanelStoreBindings() {
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
  const pageTemplate = useCanvasStore((s) => s.pageTemplate);
  const pageSizes = useCanvasStore((s) => s.pageSizes);
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const machineStatus = useMachineStore((s) => s.status);

  return {
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
  };
}
