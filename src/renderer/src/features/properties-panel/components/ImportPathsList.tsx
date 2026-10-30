import { useState } from "react";
import type { SvgImport, PassMode } from "../../../../../types";
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

/** Whether a path has an outline to draw — its own, or a generated one. */
const strokeAvailable = (imp: SvgImport, p: SvgPath) =>
  (p.sourceOutlineVisible ?? p.outlineVisible !== false) ||
  (p.generatedStrokeEnabled ?? imp.generatedStrokeForNoStroke ?? false);

type SvgPath = SvgImport["paths"][number];
type PassPatch = Partial<{ passCount: number; passMode: PassMode }>;

/** The pass-settings flyout state shared by every row of a list. */
interface PassFlyouts {
  openKey: string | null;
  toggle: (key: string) => void;
  close: () => void;
}

/** One path: its row, and (when per-path overrides are on) a flyout with
 * its pass settings. Indented under a layer or colour group. */
function PathEntry({
  imp,
  path: p,
  label,
  visible,
  strokeAvailable: canStroke,
  indented,
  onToggleVisibility,
  flyouts,
  props,
}: {
  imp: SvgImport;
  path: SvgPath;
  label: string;
  visible: boolean;
  strokeAvailable: boolean;
  indented: boolean;
  onToggleVisibility: () => void;
  flyouts: PassFlyouts;
  props: ImportPathsListProps;
}) {
  const flyoutKey = `${imp.id}:path-pass:${p.id}`;
  return (
    <div className="relative">
      <PathRow
        label={label}
        visible={visible}
        strokeEnabled={p.strokeEnabled ?? true}
        strokeAvailable={canStroke}
        indented={indented || undefined}
        onTogglePassSettings={props.enablePathPassOverrides ? () => flyouts.toggle(flyoutKey) : undefined}
        onToggleVisibility={onToggleVisibility}
        onToggleStroke={() => props.onUpdatePathStroke(imp.id, p.id, !(p.strokeEnabled ?? true))}
        onRemove={() => props.onRemovePath(imp.id, p.id)}
      />
      <FlyoutPanel
        open={flyouts.openKey === flyoutKey}
        onClose={flyouts.close}
        className={`absolute ${indented ? "left-6" : "left-4"} top-4 z-20 w-48 rounded-md border border-border-ui bg-panel p-2 shadow-xl`}
      >
        <PathPassSettings
          pathId={p.id}
          pathLabel={label}
          passCount={p.passCount}
          passMode={p.passMode}
          onUpdatePath={(id, patch) => props.onUpdatePath(imp.id, id, patch)}
          indented={indented || undefined}
        />
      </FlyoutPanel>
    </div>
  );
}

/** A path outside any group: shown or hidden as a whole. */
function PlainPathEntry({ imp, path: p, flyouts, props }: { imp: SvgImport; path: SvgPath; flyouts: PassFlyouts; props: ImportPathsListProps }) {
  return (
    <PathEntry
      imp={imp}
      path={p}
      label={p.label ?? p.layer ?? `path ${p.id.slice(0, 6)}`}
      visible={p.visible}
      strokeAvailable={strokeAvailable(imp, p)}
      indented={false}
      onToggleVisibility={() => props.onUpdatePathVisibility(imp.id, p.id, !p.visible)}
      flyouts={flyouts}
      props={props}
    />
  );
}

/** A group's pass settings, applied to all of its paths. */
function GroupPassFlyout({
  label,
  flyoutKey,
  paths,
  flyouts,
  onApply,
}: {
  label: string;
  flyoutKey: string;
  paths: SvgPath[];
  flyouts: PassFlyouts;
  onApply: (paths: SvgPath[], patch: PassPatch) => void;
}) {
  const pass = deriveGroupPass(paths);
  return (
    <FlyoutPanel
      open={flyouts.openKey === flyoutKey}
      onClose={flyouts.close}
      className="absolute left-4 top-5 z-20 w-48 rounded-md border border-border-ui bg-panel p-2 shadow-xl"
    >
      <GroupPassSettings
        label={label}
        passCount={pass.passCount}
        passMode={pass.passMode}
        onPassCountChange={(next) => onApply(paths, { passCount: next })}
        onPassModeChange={(next) => onApply(paths, { passMode: next })}
      />
    </FlyoutPanel>
  );
}

type ColorGroup = ReturnType<typeof useColorGroups>[number];

/**
 * One colour's paths. A path can be in a colour group for its fill, its
 * stroke or both; showing or hiding the group switches just those parts.
 */
function ColorGroupSection({
  imp,
  group,
  flyouts,
  onApply,
  props,
}: {
  imp: SvgImport;
  group: ColorGroup;
  flyouts: PassFlyouts;
  onApply: (paths: SvgPath[], patch: PassPatch) => void;
  props: ImportPathsListProps;
}) {
  const expanded = props.expandedLayerKeys.has(`${imp.id}:color:${group.color}`);
  const groupPaths = group.paths
    .map((groupPath) => ({ groupPath, path: imp.paths.find((p) => p.id === groupPath.pathId) }))
    .filter((entry): entry is { groupPath: ColorGroup["paths"][number]; path: SvgPath } => !!entry.path);
  // A role (fill or stroke) is visible when the path is and that part is on.
  const roleVisible = (groupPath: ColorGroup["paths"][number], path: SvgPath, role: "fill" | "stroke") =>
    role === "fill"
      ? groupPath.includesFill && path.visible && (path.fillEnabled ?? true)
      : groupPath.includesStroke && path.visible && hasVisibleStroke(imp, path) && (path.strokeEnabled ?? true);
  const anyVisible = groupPaths.some(
    ({ groupPath, path }) => roleVisible(groupPath, path, "fill") || roleVisible(groupPath, path, "stroke"),
  );
  const flyoutKey = `${imp.id}:group-pass:color:${group.color}`;

  const setVisible = (nextVisible: boolean) => {
    for (const { groupPath, path } of groupPaths) {
      if (groupPath.includesFill && (path.fillEnabled ?? true) !== nextVisible) {
        props.onUpdatePathFillEnabled(imp.id, path.id, nextVisible);
      }
      if (groupPath.includesStroke && hasVisibleStroke(imp, path) && (path.strokeEnabled ?? true) !== nextVisible) {
        props.onUpdatePathStroke(imp.id, path.id, nextVisible);
      }
    }
  };

  return (
    <div className="relative">
      <ColorGroupRow
        color={group.color}
        visible={anyVisible}
        pathCount={group.count}
        expanded={expanded}
        onTogglePassSettings={() => flyouts.toggle(flyoutKey)}
        onToggleExpanded={() => props.onToggleLayerCollapse(imp.id, `color:${group.color}`)}
        onToggleVisible={() => setVisible(!anyVisible)}
      />
      <GroupPassFlyout
        label="Colour"
        flyoutKey={flyoutKey}
        paths={groupPaths.map((entry) => entry.path)}
        flyouts={flyouts}
        onApply={onApply}
      />
      {expanded &&
        groupPaths.map(({ groupPath, path: p }) => (
          <PathEntry
            key={`${group.color}:${p.id}`}
            imp={imp}
            path={p}
            label={p.label ?? `path ${p.id.slice(0, 6)}`}
            visible={
              groupPath.includesFill
                ? p.visible && (p.fillEnabled ?? true)
                : p.visible && hasVisibleStroke(imp, p) && (p.strokeEnabled ?? true)
            }
            strokeAvailable={hasVisibleStroke(imp, p)}
            indented
            onToggleVisibility={() =>
              groupPath.includesFill
                ? props.onUpdatePathFillEnabled(imp.id, p.id, !(p.fillEnabled ?? true))
                : props.onUpdatePathStroke(imp.id, p.id, !(p.strokeEnabled ?? true))
            }
            flyouts={flyouts}
            props={props}
          />
        ))}
    </div>
  );
}

/** One source layer's paths. A layer the SVG did not declare (named only
 * on its paths) is shown or hidden path by path. */
function LayerSection({
  imp,
  layer,
  flyouts,
  onApply,
  props,
}: {
  imp: SvgImport;
  layer: LayerView;
  flyouts: PassFlyouts;
  onApply: (paths: SvgPath[], patch: PassPatch) => void;
  props: ImportPathsListProps;
}) {
  const layerPaths = imp.paths.filter((p) => p.layer === layer.id);
  const expanded = props.expandedLayerKeys.has(`${imp.id}:${layer.id}`);
  const flyoutKey = `${imp.id}:group-pass:layer:${layer.id}`;
  return (
    <div className="relative">
      <LayerRow
        name={layer.name}
        visible={layer.visible}
        pathCount={layerPaths.length}
        expanded={expanded}
        onTogglePassSettings={() => flyouts.toggle(flyoutKey)}
        onToggleExpanded={() => props.onToggleLayerCollapse(imp.id, layer.id)}
        onToggleVisible={() =>
          layer.synthetic
            ? layerPaths.forEach((path) => props.onUpdatePathVisibility(imp.id, path.id, !layer.visible))
            : props.onUpdateLayerVisibility(imp.id, layer.id, !layer.visible)
        }
      />
      <GroupPassFlyout label="Layer" flyoutKey={flyoutKey} paths={layerPaths} flyouts={flyouts} onApply={onApply} />
      {expanded &&
        layerPaths.map((p) => (
          <PathEntry
            key={p.id}
            imp={imp}
            path={p}
            label={p.label ?? `path ${p.id.slice(0, 6)}`}
            visible={p.visible}
            strokeAvailable={strokeAvailable(imp, p)}
            indented
            onToggleVisibility={() => props.onUpdatePathVisibility(imp.id, p.id, !p.visible)}
            flyouts={flyouts}
            props={props}
          />
        ))}
    </div>
  );
}

export function ImportPathsList(props: ImportPathsListProps) {
  const { imp, groupBy = "layer", onSelectImport, onUpdatePath } = props;
  const colorGroups = useColorGroups(imp);
  const layerViews = deriveLayerViews(imp);
  const [openPassFlyoutKey, setOpenPassFlyoutKey] = useState<string | null>(null);
  const flyouts: PassFlyouts = {
    openKey: openPassFlyoutKey,
    toggle: (key) => setOpenPassFlyoutKey((current) => (current === key ? null : key)),
    close: () => setOpenPassFlyoutKey(null),
  };
  const applyPassToPaths = (paths: Array<{ id: string }>, patch: PassPatch) => {
    for (const path of paths) onUpdatePath(imp.id, path.id, patch);
  };
  const plain = (paths: SvgPath[]) =>
    paths.map((p) => <PlainPathEntry key={p.id} imp={imp} path={p} flyouts={flyouts} props={props} />);

  let body: React.ReactNode;
  if (groupBy === "color") {
    body =
      colorGroups.length > 0
        ? colorGroups.map((group) => (
            <ColorGroupSection
              key={group.color}
              imp={imp}
              group={group}
              flyouts={flyouts}
              onApply={applyPassToPaths}
              props={props}
            />
          ))
        : plain(imp.paths);
  } else if (layerViews.length > 0) {
    body = (
      <>
        {layerViews.map((layer) => (
          <LayerSection key={layer.id} imp={imp} layer={layer} flyouts={flyouts} onApply={applyPassToPaths} props={props} />
        ))}
        {plain(imp.paths.filter((p) => !p.layer || !layerViews.some((l) => l.id === p.layer)))}
      </>
    );
  } else {
    body = plain(imp.paths);
  }

  return (
    <div className="pl-6 pr-2 pb-1 border-t border-border-ui/20" onClick={() => onSelectImport(imp.id)}>
      {body}
    </div>
  );
}
