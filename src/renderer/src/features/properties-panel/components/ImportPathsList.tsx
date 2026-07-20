import { useState } from "react";
import type { SvgImport, PassMode } from "../../../../types";
import { FlyoutPanel } from "../../../components/FlyoutPanel";
import { LayerRow } from "./LayerRow";
import { ColorGroupRow } from "./ColorGroupRow";
import { PathRow } from "./PathRow";
import { GroupPassSettings } from "./GroupPassSettings";
import { PathPassSettings } from "./PathPassSettings";
import { useColorGroups } from "../hooks/useColorGroupsModel";

type LayerView = {
  id: string;
  name: string;
  visible: boolean;
  synthetic: boolean;
};

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

function deriveLayerViews(imp: SvgImport): LayerView[] {
  if (imp.layers && imp.layers.length > 0) {
    return imp.layers.map((layer) => ({
      ...layer,
      synthetic: false,
    }));
  }

  const fallbackLayers = new Map<string, Array<SvgImport["paths"][number]>>();

  for (const path of imp.paths) {
    if (!path.layer) continue;
    const paths = fallbackLayers.get(path.layer) ?? [];
    paths.push(path);
    fallbackLayers.set(path.layer, paths);
  }

  return Array.from(fallbackLayers.entries()).map(([layerId, paths]) => ({
    id: layerId,
    name: layerId,
    visible: paths.some((path) => path.visible),
    synthetic: true,
  }));
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
  const layerViews = deriveLayerViews(imp);
  const [openPassFlyoutKey, setOpenPassFlyoutKey] = useState<string | null>(
    null,
  );

  const applyPassToPaths = (
    paths: Array<{ id: string }>,
    patch: Partial<{ passCount: number; passMode: PassMode }>,
  ) => {
    for (const path of paths) {
      onUpdatePath(imp.id, path.id, patch);
    }
  };

  const togglePassFlyout = (key: string) => {
    setOpenPassFlyoutKey((current) => (current === key ? null : key));
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

            const groupFlyoutKey = `${imp.id}:group-pass:color:${group.color}`;

            return (
              <div key={group.color} className="relative">
                <ColorGroupRow
                  color={group.color}
                  visible={anyVisible}
                  pathCount={group.count}
                  expanded={isColorExpanded}
                  onTogglePassSettings={() => togglePassFlyout(groupFlyoutKey)}
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

                <FlyoutPanel
                  open={openPassFlyoutKey === groupFlyoutKey}
                  onClose={() => setOpenPassFlyoutKey(null)}
                  className="absolute left-4 top-5 z-20 w-48 rounded-md border border-border-ui bg-panel p-2 shadow-xl"
                >
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
                </FlyoutPanel>

                {isColorExpanded &&
                  groupPaths.map(({ groupPath, path: p }) => {
                    const roleVisible = groupPath.includesFill
                      ? p.visible && (p.fillEnabled ?? true)
                      : p.visible &&
                        hasVisibleStroke(imp, p) &&
                        (p.strokeEnabled ?? true);
                    const label = p.label ?? `path ${p.id.slice(0, 6)}`;
                    const pathFlyoutKey = `${imp.id}:path-pass:${p.id}`;

                    return (
                      <div key={`${group.color}:${p.id}`} className="relative">
                        <PathRow
                          label={label}
                          visible={roleVisible}
                          strokeEnabled={p.strokeEnabled ?? true}
                          strokeAvailable={hasVisibleStroke(imp, p)}
                          indented
                          onTogglePassSettings={
                            enablePathPassOverrides
                              ? () => togglePassFlyout(pathFlyoutKey)
                              : undefined
                          }
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
                        <FlyoutPanel
                          open={openPassFlyoutKey === pathFlyoutKey}
                          onClose={() => setOpenPassFlyoutKey(null)}
                          className="absolute left-6 top-4 z-20 w-48 rounded-md border border-border-ui bg-panel p-2 shadow-xl"
                        >
                          <PathPassSettings
                            pathId={p.id}
                            pathLabel={label}
                            passCount={p.passCount}
                            passMode={p.passMode}
                            onUpdatePath={(id, patch) =>
                              onUpdatePath(imp.id, id, patch)
                            }
                            indented
                          />
                        </FlyoutPanel>
                      </div>
                    );
                  })}
              </div>
            );
          })
        ) : (
          imp.paths.map((p) => {
            const label = p.label ?? p.layer ?? `path ${p.id.slice(0, 6)}`;
            const pathFlyoutKey = `${imp.id}:path-pass:${p.id}`;
            return (
              <div key={p.id} className="relative">
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
                  onTogglePassSettings={
                    enablePathPassOverrides
                      ? () => togglePassFlyout(pathFlyoutKey)
                      : undefined
                  }
                  onToggleVisibility={() =>
                    onUpdatePathVisibility(imp.id, p.id, !p.visible)
                  }
                  onToggleStroke={() =>
                    onUpdatePathStroke(imp.id, p.id, !(p.strokeEnabled ?? true))
                  }
                  onRemove={() => onRemovePath(imp.id, p.id)}
                />
                <FlyoutPanel
                  open={openPassFlyoutKey === pathFlyoutKey}
                  onClose={() => setOpenPassFlyoutKey(null)}
                  className="absolute left-4 top-4 z-20 w-48 rounded-md border border-border-ui bg-panel p-2 shadow-xl"
                >
                  <PathPassSettings
                    pathId={p.id}
                    pathLabel={label}
                    passCount={p.passCount}
                    passMode={p.passMode}
                    onUpdatePath={(id, patch) =>
                      onUpdatePath(imp.id, id, patch)
                    }
                  />
                </FlyoutPanel>
              </div>
            );
          })
        )
      ) : layerViews.length > 0 ? (
        <>
          {layerViews.map((layer) => {
            const layerPaths = imp.paths.filter((p) => p.layer === layer.id);
            const layerKey = `${imp.id}:${layer.id}`;
            const isLayerExpanded = expandedLayerKeys.has(layerKey);
            const layerPass = deriveGroupPass(layerPaths);

            const layerFlyoutKey = `${imp.id}:group-pass:layer:${layer.id}`;

            return (
              <div key={layer.id} className="relative">
                <LayerRow
                  name={layer.name}
                  visible={layer.visible}
                  pathCount={layerPaths.length}
                  expanded={isLayerExpanded}
                  onTogglePassSettings={() => togglePassFlyout(layerFlyoutKey)}
                  onToggleExpanded={() =>
                    onToggleLayerCollapse(imp.id, layer.id)
                  }
                  onToggleVisible={() =>
                    layer.synthetic
                      ? layerPaths.forEach((path) =>
                          onUpdatePathVisibility(
                            imp.id,
                            path.id,
                            !layer.visible,
                          ),
                        )
                      : onUpdateLayerVisibility(
                          imp.id,
                          layer.id,
                          !layer.visible,
                        )
                  }
                />

                <FlyoutPanel
                  open={openPassFlyoutKey === layerFlyoutKey}
                  onClose={() => setOpenPassFlyoutKey(null)}
                  className="absolute left-4 top-5 z-20 w-48 rounded-md border border-border-ui bg-panel p-2 shadow-xl"
                >
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
                </FlyoutPanel>

                {isLayerExpanded &&
                  layerPaths.map((p) => {
                    const label = p.label ?? `path ${p.id.slice(0, 6)}`;
                    const pathFlyoutKey = `${imp.id}:path-pass:${p.id}`;
                    return (
                      <div key={p.id} className="relative">
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
                          onTogglePassSettings={
                            enablePathPassOverrides
                              ? () => togglePassFlyout(pathFlyoutKey)
                              : undefined
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
                        <FlyoutPanel
                          open={openPassFlyoutKey === pathFlyoutKey}
                          onClose={() => setOpenPassFlyoutKey(null)}
                          className="absolute left-6 top-4 z-20 w-48 rounded-md border border-border-ui bg-panel p-2 shadow-xl"
                        >
                          <PathPassSettings
                            pathId={p.id}
                            pathLabel={label}
                            passCount={p.passCount}
                            passMode={p.passMode}
                            onUpdatePath={(id, patch) =>
                              onUpdatePath(imp.id, id, patch)
                            }
                            indented
                          />
                        </FlyoutPanel>
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
              const pathFlyoutKey = `${imp.id}:path-pass:${p.id}`;
              return (
                <div key={p.id} className="relative">
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
                    onTogglePassSettings={
                      enablePathPassOverrides
                        ? () => togglePassFlyout(pathFlyoutKey)
                        : undefined
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
                  <FlyoutPanel
                    open={openPassFlyoutKey === pathFlyoutKey}
                    onClose={() => setOpenPassFlyoutKey(null)}
                    className="absolute left-4 top-4 z-20 w-48 rounded-md border border-border-ui bg-panel p-2 shadow-xl"
                  >
                    <PathPassSettings
                      pathId={p.id}
                      pathLabel={label}
                      passCount={p.passCount}
                      passMode={p.passMode}
                      onUpdatePath={(id, patch) =>
                        onUpdatePath(imp.id, id, patch)
                      }
                    />
                  </FlyoutPanel>
                </div>
              );
            })}
        </>
      ) : (
        imp.paths.map((p) => {
          const label = p.label ?? p.layer ?? `path ${p.id.slice(0, 6)}`;
          const pathFlyoutKey = `${imp.id}:path-pass:${p.id}`;
          return (
            <div key={p.id} className="relative">
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
                onTogglePassSettings={
                  enablePathPassOverrides
                    ? () => togglePassFlyout(pathFlyoutKey)
                    : undefined
                }
                onToggleVisibility={() =>
                  onUpdatePathVisibility(imp.id, p.id, !p.visible)
                }
                onToggleStroke={() =>
                  onUpdatePathStroke(imp.id, p.id, !(p.strokeEnabled ?? true))
                }
                onRemove={() => onRemovePath(imp.id, p.id)}
              />
              <FlyoutPanel
                open={openPassFlyoutKey === pathFlyoutKey}
                onClose={() => setOpenPassFlyoutKey(null)}
                className="absolute left-4 top-4 z-20 w-48 rounded-md border border-border-ui bg-panel p-2 shadow-xl"
              >
                <PathPassSettings
                  pathId={p.id}
                  pathLabel={label}
                  passCount={p.passCount}
                  passMode={p.passMode}
                  onUpdatePath={(id, patch) => onUpdatePath(imp.id, id, patch)}
                />
              </FlyoutPanel>
            </div>
          );
        })
      )}
    </div>
  );
}
