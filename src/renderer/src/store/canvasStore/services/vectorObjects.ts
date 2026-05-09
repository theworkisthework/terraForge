import type {
  LayerGroup,
  SvgImport,
  SvgPath,
  VectorObject,
} from "../../../../../types";
import { normalizeSvgColor } from "../../../features/imports/services/svgImportHelpers";

const GENERATED_STROKE_GROUP_COLOR = normalizeSvgColor("black");

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
    viewBoxX: imp.viewBoxX,
    viewBoxY: imp.viewBoxY,
    layer: path.layer,
  };
  const importStrokeEnabled = imp.strokeEnabled ?? true;
  const pathStrokeEnabled = path.strokeEnabled ?? true;
  const sourceOutlineVisible =
    typeof path.sourceOutlineVisible === "boolean"
      ? path.sourceOutlineVisible
      : path.outlineVisible !== false;
  const generatedStrokeEnabled =
    path.generatedStrokeEnabled ?? imp.generatedStrokeForNoStroke ?? false;
  const hasStrokeGeometry = sourceOutlineVisible || generatedStrokeEnabled;
  const rawStrokeColor = path.strokeColor
    ? path.strokeColor
    : sourceOutlineVisible
      ? path.sourceColor
      : generatedStrokeEnabled
        ? GENERATED_STROKE_GROUP_COLOR
        : undefined;
  const strokeColor = rawStrokeColor
    ? normalizeSvgColor(rawStrokeColor)
    : undefined;

  const outlineVOs: VectorObject[] =
    importStrokeEnabled && pathStrokeEnabled && hasStrokeGeometry
      ? [
          {
            ...base,
            sourceColor: strokeColor,
          },
        ]
      : [];
  const hatchVOs: VectorObject[] = (path.hatchLines ?? []).map(
    (hatchLine, index): VectorObject => ({
      ...base,
      id: `${path.id}-h${index}`,
      svgSource: "",
      path: hatchLine,
      sourceColor: path.fillColor
        ? normalizeSvgColor(path.fillColor)
        : undefined,
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
