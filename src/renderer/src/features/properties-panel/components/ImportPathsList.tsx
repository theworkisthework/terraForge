import type { SvgImport } from "../../../../types";
import { LayerRow } from "./LayerRow";
import { ColorGroupRow } from "./ColorGroupRow";
import { PathRow } from "./PathRow";
import { useColorGroups } from "../hooks/useColorGroupsModel";

function hasVisibleStroke(imp: SvgImport, path: SvgImport["paths"][number]) {
  const sourceOutlineVisible =
    typeof path.sourceOutlineVisible === "boolean"
      ? path.sourceOutlineVisible
      : path.outlineVisible !== false;
  const generatedStrokeEnabled =
    path.generatedStrokeEnabled ?? imp.generatedStrokeForNoStroke ?? false;
  return sourceOutlineVisible || generatedStrokeEnabled;
}

interface ImportPathsListProps {
  imp: SvgImport;
  expandedLayerKeys: Set<string>;
  groupBy?: "layer" | "color"; // Default: 'layer'
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
  onUpdatePathFillEnabled: (
    importId: string,
    pathId: string,
    fillEnabled: boolean,
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
  groupBy = "layer",
  onSelectImport,
  onToggleLayerCollapse,
  onUpdateLayerVisibility,
  onUpdatePathVisibility,
  onUpdatePathFillEnabled,
  onUpdatePathStroke,
  onRemovePath,
}: ImportPathsListProps) {
  const colorGroups = useColorGroups(imp);
  return (
    <div
      className="pl-6 pr-2 pb-1 border-t border-border-ui/20"
      onClick={() => onSelectImport(imp.id)}
    >
      {groupBy === "color" ? (
        // Render by color groups
        colorGroups.length > 0 ? (
          colorGroups.map((group) => {
            const colorKey = `${imp.id}:color:${group.color}`;
            const isColorExpanded = expandedLayerKeys.has(colorKey);
            const groupPaths = group.paths
              .map((groupPath) => ({
                groupPath,
                path: imp.paths.find((p) => p.id === groupPath.pathId),
              }))
              .filter(
                (
                  entry,
                ): entry is {
                  groupPath: (typeof group.paths)[number];
                  path: (typeof imp.paths)[number];
                } => !!entry.path,
              );
            const anyVisible = groupPaths.some(({ groupPath, path }) => {
              const fillVisible =
                groupPath.includesFill &&
                path.visible &&
                (path.fillEnabled ?? true);
              const strokeVisible =
                groupPath.includesStroke &&
                path.visible &&
                hasVisibleStroke(imp, path) &&
                (path.strokeEnabled ?? true);
              return fillVisible || strokeVisible;
            });

            return (
              <div key={group.color}>
                <ColorGroupRow
                  color={group.color}
                  visible={anyVisible}
                  pathCount={group.count}
                  expanded={isColorExpanded}
                  onToggleExpanded={() =>
                    onToggleLayerCollapse(imp.id, `color:${group.color}`)
                  }
                  onToggleVisible={() => {
                    const nextVisible = !anyVisible;
                    for (const { groupPath, path } of groupPaths) {
                      if (
                        groupPath.includesFill &&
                        (path.fillEnabled ?? true) !== nextVisible
                      ) {
                        onUpdatePathFillEnabled(imp.id, path.id, nextVisible);
                      }
                      if (
                        groupPath.includesStroke &&
                        hasVisibleStroke(imp, path) &&
                        (path.strokeEnabled ?? true) !== nextVisible
                      ) {
                        onUpdatePathStroke(imp.id, path.id, nextVisible);
                      }
                    }
                  }}
                />
                {isColorExpanded &&
                  groupPaths.map(({ groupPath, path: p }) => {
                    const roleVisible = groupPath.includesFill
                      ? p.visible && (p.fillEnabled ?? true)
                      : p.visible &&
                        hasVisibleStroke(imp, p) &&
                        (p.strokeEnabled ?? true);

                    return (
                      <PathRow
                        key={`${group.color}:${p.id}`}
                        label={p.label ?? `path ${p.id.slice(0, 6)}`}
                        visible={roleVisible}
                        strokeEnabled={p.strokeEnabled ?? true}
                        strokeAvailable={hasVisibleStroke(imp, p)}
                        indented
                        onToggleVisibility={() => {
                          if (groupPath.includesFill) {
                            onUpdatePathFillEnabled(
                              imp.id,
                              p.id,
                              !(p.fillEnabled ?? true),
                            );
                            return;
                          }
                          onUpdatePathStroke(
                            imp.id,
                            p.id,
                            !(p.strokeEnabled ?? true),
                          );
                        }}
                        onToggleStroke={() =>
                          onUpdatePathStroke(
                            imp.id,
                            p.id,
                            !(p.strokeEnabled ?? true),
                          )
                        }
                        onRemove={() => onRemovePath(imp.id, p.id)}
                      />
                    );
                  })}
              </div>
            );
          })
        ) : (
          // No color groups (no filled paths)
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
        )
      ) : // Render by layers (default, existing logic)
      imp.layers && imp.layers.length > 0 ? (
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
