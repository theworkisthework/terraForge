import type { SvgImport } from "../../../../../types";

export interface LayerDipOption {
  id: string;
  index: number;
  name: string | undefined;
  colorCode: string | undefined;
}

export function buildLayerDipOptions(imports: SvgImport[]): LayerDipOption[] {
  const orderedLayerIds: string[] = [];
  const layerNamesById = new Map<string, string>();
  const layerColorById = new Map<string, string>();
  const orderedColorKeys: string[] = [];

  const normalizeColor = (value: string): string => value.trim().toLowerCase();

  const addColorEntry = (rawColor: string | undefined): void => {
    if (!rawColor) return;
    const normalized = normalizeColor(rawColor);
    if (!normalized) return;

    const key = `color:${normalized}`;
    if (!orderedColorKeys.includes(key)) {
      orderedColorKeys.push(key);
    }

    if (!layerNamesById.has(key)) {
      layerNamesById.set(key, `Color ${rawColor.trim()}`);
    }

    if (!layerColorById.has(key)) {
      layerColorById.set(key, rawColor);
    }
  };

  for (const importedSvg of imports) {
    for (const layer of importedSvg.layers ?? []) {
      if (!orderedLayerIds.includes(layer.id)) {
        orderedLayerIds.push(layer.id);
      }

      if (!layerNamesById.has(layer.id) && layer.name) {
        layerNamesById.set(layer.id, layer.name);
      }
    }

    for (const path of importedSvg.paths) {
      const color = path.sourceColor ?? path.strokeColor ?? path.fillColor;
      addColorEntry(color);

      if (!path.layer) {
        continue;
      }

      if (!orderedLayerIds.includes(path.layer)) {
        orderedLayerIds.push(path.layer);
      }

      if (!layerNamesById.has(path.layer)) {
        layerNamesById.set(path.layer, path.layer);
      }

      if (!layerColorById.has(path.layer) && color) {
        layerColorById.set(path.layer, color);
      }
    }
  }

  const optionIds =
    orderedLayerIds.length > 0 ? orderedLayerIds : orderedColorKeys;

  return optionIds.map((id, index) => ({
    id,
    index: index + 1,
    name: layerNamesById.get(id),
    colorCode: layerColorById.get(id),
  }));
}
