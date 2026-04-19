import type { SvgImport } from "../../../../types";
import { LayerRow } from "./LayerRow";
import { PathRow } from "./PathRow";

interface ImportPathsListProps {
  imp: SvgImport;
  expandedLayerKeys: Set<string>;
  onSelectImport: (importId: string) => void;
  onToggleLayerCollapse: (importId: string, layerId: string) => void;
  onUpdateLayerVisibility: (
    importId: string,
    layerId: string,
    visible: boolean,
  ) => void;
  onUpdatePathVisibility: (
    importId: string,
    pathId: string,
    visible: boolean,
  ) => void;
  onUpdatePathStroke: (
    importId: string,
    pathId: string,
    strokeEnabled: boolean,
  ) => void;
  onRemovePath: (importId: string, pathId: string) => void;
}

export function ImportPathsList({
  imp,
  expandedLayerKeys,
  onSelectImport,
  onToggleLayerCollapse,
  onUpdateLayerVisibility,
  onUpdatePathVisibility,
  onUpdatePathStroke,
  onRemovePath,
}: ImportPathsListProps) {
  return (
    <div
      className="pl-6 pr-2 pb-1 border-t border-border-ui/20"
      onClick={() => onSelectImport(imp.id)}
    >
      {imp.layers && imp.layers.length > 0 ? (
        <>
          {imp.layers.map((layer) => {
            const layerPaths = imp.paths.filter((p) => p.layer === layer.id);
            const layerKey = `${imp.id}:${layer.id}`;
            const isLayerExpanded = expandedLayerKeys.has(layerKey);
            return (
              <div key={layer.id}>
                <LayerRow
                  name={layer.name}
                  visible={layer.visible}
                  pathCount={layerPaths.length}
                  expanded={isLayerExpanded}
                  onToggleExpanded={() =>
                    onToggleLayerCollapse(imp.id, layer.id)
                  }
                  onToggleVisible={() =>
                    onUpdateLayerVisibility(imp.id, layer.id, !layer.visible)
                  }
                />
                {isLayerExpanded &&
                  layerPaths.map((p) => (
                    <PathRow
                      key={p.id}
                      label={p.label ?? `path ${p.id.slice(0, 6)}`}
                      visible={p.visible}
                      strokeEnabled={p.strokeEnabled ?? true}
                      strokeAvailable={
                        (p.sourceOutlineVisible ??
                          p.outlineVisible !== false) ||
                        (p.generatedStrokeEnabled ??
                          imp.generatedStrokeForNoStroke ??
                          false)
                      }
                      indented
                      onToggleVisibility={() =>
                        onUpdatePathVisibility(imp.id, p.id, !p.visible)
                      }
                      onToggleStroke={() =>
                        onUpdatePathStroke(
                          imp.id,
                          p.id,
                          !(p.strokeEnabled ?? true),
                        )
                      }
                      onRemove={() => onRemovePath(imp.id, p.id)}
                    />
                  ))}
              </div>
            );
          })}
          {imp.paths
            .filter(
              (p) => !p.layer || !imp.layers!.some((l) => l.id === p.layer),
            )
            .map((p) => (
              <PathRow
                key={p.id}
                label={p.label ?? p.layer ?? `path ${p.id.slice(0, 6)}`}
                visible={p.visible}
                strokeEnabled={p.strokeEnabled ?? true}
                strokeAvailable={
                  (p.sourceOutlineVisible ?? p.outlineVisible !== false) ||
                  (p.generatedStrokeEnabled ??
                    imp.generatedStrokeForNoStroke ??
                    false)
                }
                onToggleVisibility={() =>
                  onUpdatePathVisibility(imp.id, p.id, !p.visible)
                }
                onToggleStroke={() =>
                  onUpdatePathStroke(imp.id, p.id, !(p.strokeEnabled ?? true))
                }
                onRemove={() => onRemovePath(imp.id, p.id)}
              />
            ))}
        </>
      ) : (
        imp.paths.map((p) => (
          <PathRow
            key={p.id}
            label={p.label ?? p.layer ?? `path ${p.id.slice(0, 6)}`}
            visible={p.visible}
            strokeEnabled={p.strokeEnabled ?? true}
            strokeAvailable={
              (p.sourceOutlineVisible ?? p.outlineVisible !== false) ||
              (p.generatedStrokeEnabled ??
                imp.generatedStrokeForNoStroke ??
                false)
            }
            onToggleVisibility={() =>
              onUpdatePathVisibility(imp.id, p.id, !p.visible)
            }
            onToggleStroke={() =>
              onUpdatePathStroke(imp.id, p.id, !(p.strokeEnabled ?? true))
            }
            onRemove={() => onRemovePath(imp.id, p.id)}
          />
        ))
      )}
    </div>
  );
}
