import type { SvgImport, PassMode } from "../../../../types";
import { LayerRow } from "./LayerRow";
import { ColorGroupRow } from "./ColorGroupRow";
import { PathRow } from "./PathRow";
import { GroupPassSettings } from "./GroupPassSettings";
import { PathPassSettings } from "./PathPassSettings";
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

function deriveGroupPass(paths: SvgImport["paths"]): {
  passCount: number;
  passMode: PassMode;
} {
  if (paths.length === 0) {
    return { passCount: 1, passMode: "repeat" };
  }
  return {
    passCount: paths[0].passCount ?? 1,
    passMode: paths[0].passMode ?? "repeat",
  };
}

interface ImportPathsListProps {
  imp: SvgImport;
  expandedLayerKeys: Set<string>;
  groupBy?: "layer" | "color";
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
  onUpdatePath: (
    importId: string,
    pathId: string,
    patch: Partial<{ passCount: number; passMode: PassMode }>,
  ) => void;
  enablePathPassOverrides?: boolean;
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
  onUpdatePath,
  enablePathPassOverrides = false,
  onRemovePath,
}: ImportPathsListProps) {
  const colorGroups = useColorGroups(imp);

  const applyPassToPaths = (
    paths: Array<{ id: string }>,
    patch: Partial<{ passCount: number; passMode: PassMode }>,
  ) => {
    for (const path of paths) {
      onUpdatePath(imp.id, path.id, patch);
    }
  };

  const renderPathOverride = (
    pathId: string,
    label: string,
    passCount?: number,
    passMode?: PassMode,
    indented?: boolean,
  ) => {
    if (!enablePathPassOverrides) return null;
    return (
      <PathPassSettings
        pathId={pathId}
        pathLabel={label}
        passCount={passCount}
        passMode={passMode}
        onUpdatePath={(id, patch) => onUpdatePath(imp.id, id, patch)}
        indented={indented}
      />
    );
  };

  return (
    <div
      className="pl-6 pr-2 pb-1 border-t border-border-ui/20"
      onClick={() => onSelectImport(imp.id)}
    >
      {groupBy === "color" ? (
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

            const groupPass = deriveGroupPass(
              groupPaths.map((entry) => entry.path),
            );

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

                <GroupPassSettings
                  label="Colour"
                  passCount={groupPass.passCount}
                  passMode={groupPass.passMode}
                  onPassCountChange={(next) =>
                    applyPassToPaths(
                      groupPaths.map((entry) => entry.path),
                      {
                        passCount: next,
                      },
                    )
                  }
                  onPassModeChange={(next) =>
                    applyPassToPaths(
                      groupPaths.map((entry) => entry.path),
                      {
                        passMode: next,
                      },
                    )
                  }
                />

                {isColorExpanded &&
                  groupPaths.map(({ groupPath, path: p }) => {
                    const roleVisible = groupPath.includesFill
                      ? p.visible && (p.fillEnabled ?? true)
                      : p.visible &&
                        hasVisibleStroke(imp, p) &&
                        (p.strokeEnabled ?? true);
                    const label = p.label ?? `path ${p.id.slice(0, 6)}`;

                    return (
                      <div key={`${group.color}:${p.id}`}>
                        <PathRow
                          label={label}
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
                        {renderPathOverride(
                          p.id,
                          label,
                          p.passCount,
                          p.passMode,
                          true,
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })
        ) : (
          imp.paths.map((p) => {
            const label = p.label ?? p.layer ?? `path ${p.id.slice(0, 6)}`;
            return (
              <div key={p.id}>
                <PathRow
                  label={label}
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
                {renderPathOverride(p.id, label, p.passCount, p.passMode)}
              </div>
            );
          })
        )
      ) : imp.layers && imp.layers.length > 0 ? (
        <>
          {imp.layers.map((layer) => {
            const layerPaths = imp.paths.filter((p) => p.layer === layer.id);
            const layerKey = `${imp.id}:${layer.id}`;
            const isLayerExpanded = expandedLayerKeys.has(layerKey);
            const layerPass = deriveGroupPass(layerPaths);

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

                <GroupPassSettings
                  label="Layer"
                  passCount={layerPass.passCount}
                  passMode={layerPass.passMode}
                  onPassCountChange={(next) =>
                    applyPassToPaths(layerPaths, { passCount: next })
                  }
                  onPassModeChange={(next) =>
                    applyPassToPaths(layerPaths, { passMode: next })
                  }
                />

                {isLayerExpanded &&
                  layerPaths.map((p) => {
                    const label = p.label ?? `path ${p.id.slice(0, 6)}`;
                    return (
                      <div key={p.id}>
                        <PathRow
                          label={label}
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
                        {renderPathOverride(
                          p.id,
                          label,
                          p.passCount,
                          p.passMode,
                          true,
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}

          {imp.paths
            .filter(
              (p) => !p.layer || !imp.layers!.some((l) => l.id === p.layer),
            )
            .map((p) => {
              const label = p.label ?? p.layer ?? `path ${p.id.slice(0, 6)}`;
              return (
                <div key={p.id}>
                  <PathRow
                    label={label}
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
                      onUpdatePathStroke(
                        imp.id,
                        p.id,
                        !(p.strokeEnabled ?? true),
                      )
                    }
                    onRemove={() => onRemovePath(imp.id, p.id)}
                  />
                  {renderPathOverride(p.id, label, p.passCount, p.passMode)}
                </div>
              );
            })}
        </>
      ) : (
        imp.paths.map((p) => {
          const label = p.label ?? p.layer ?? `path ${p.id.slice(0, 6)}`;
          return (
            <div key={p.id}>
              <PathRow
                label={label}
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
              {renderPathOverride(p.id, label, p.passCount, p.passMode)}
            </div>
          );
        })
      )}
    </div>
  );
}
