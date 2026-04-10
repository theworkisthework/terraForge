import type {
  LayerGroup,
  SvgImport,
  SvgPath,
  VectorObject,
} from "../../../../../types";

function isLayerVisible(
  path: SvgPath,
  hiddenLayerIds: Set<string> | null,
): boolean {
  return !hiddenLayerIds || !path.layer || !hiddenLayerIds.has(path.layer);
}

function projectPathToVectorObjects(
  imp: SvgImport,
  path: SvgPath,
): VectorObject[] {
  const base: VectorObject = {
    id: path.id,
    svgSource: path.svgSource,
    path: path.d,
    x: imp.x,
    y: imp.y,
    scale: imp.scale,
    scaleX: imp.scaleX,
    scaleY: imp.scaleY,
    rotation: imp.rotation,
    visible: true,
    originalWidth: imp.svgWidth,
    originalHeight: imp.svgHeight,
    layer: path.layer,
  };
  const outlineVOs: VectorObject[] =
    path.outlineVisible !== false ? [base] : [];
  const hatchVOs: VectorObject[] = (path.hatchLines ?? []).map(
    (hatchLine, index): VectorObject => ({
      ...base,
      id: `${path.id}-h${index}`,
      svgSource: "",
      path: hatchLine,
    }),
  );
  return [...outlineVOs, ...hatchVOs];
}

export function vectorObjectsForImport(imp: SvgImport): VectorObject[] {
  if (!imp.visible) return [];
  const hiddenLayerIds = imp.layers
    ? new Set(
        imp.layers.filter((layer) => !layer.visible).map((layer) => layer.id),
      )
    : null;

  return imp.paths
    .filter((path) => path.visible && isLayerVisible(path, hiddenLayerIds))
    .flatMap((path) => projectPathToVectorObjects(imp, path));
}

export function vectorObjectsForImports(imports: SvgImport[]): VectorObject[] {
  return imports.flatMap((imp) => vectorObjectsForImport(imp));
}

export function vectorObjectsForGroup(
  imports: SvgImport[],
  layerGroups: LayerGroup[],
  groupId: string,
): VectorObject[] {
  const group = layerGroups.find((entry) => entry.id === groupId);
  if (!group) return [];
  const groupImportIds = new Set(group.importIds);
  return imports
    .filter((imp) => groupImportIds.has(imp.id))
    .flatMap((imp) => vectorObjectsForImport(imp));
}

export function vectorObjectsUngrouped(
  imports: SvgImport[],
  layerGroups: LayerGroup[],
): VectorObject[] {
  const groupedImportIds = new Set(
    layerGroups.flatMap((group) => group.importIds),
  );
  return imports
    .filter((imp) => !groupedImportIds.has(imp.id))
    .flatMap((imp) => vectorObjectsForImport(imp));
}
