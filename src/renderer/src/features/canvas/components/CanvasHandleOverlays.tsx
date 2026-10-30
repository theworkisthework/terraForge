import type { SvgImport, LayerGroup } from "../../../../../types";
import { GroupHandleOverlay, HandleOverlay } from "..";

type GroupHandleProps = React.ComponentProps<typeof GroupHandleOverlay>;
type HandleProps = React.ComponentProps<typeof HandleOverlay>;

interface CanvasHandleOverlaysProps {
  imports: SvgImport[];
  selectedImportId: string | null;
  allImportsSelected: boolean;
  selectedGroupId: string | null;
  layerGroups: LayerGroup[];
  zoom: number;
  panX: number;
  panY: number;
  containerW: number;
  containerH: number;
  getBedY: (y: number) => number;
  groupObbAngle: number;
  groupRotating: {
    gCx: number;
    gCy: number;
    gHW: number;
    gHH: number;
  } | null;
  persistentGroupOBB: {
    gCx: number;
    gCy: number;
    gHW: number;
    gHH: number;
    angle: number;
  } | null;
  // Passed straight through, so typed by the overlays that call them.
  onGroupMouseDown: GroupHandleProps["onGroupMouseDown"];
  onHandleMouseDown: HandleProps["onHandleMouseDown"];
  onRotateHandleMouseDown: HandleProps["onRotateHandleMouseDown"];
  onGroupHandleMouseDown: GroupHandleProps["onGroupHandleMouseDown"];
  onGroupRotateHandleMouseDown: GroupHandleProps["onGroupRotateHandleMouseDown"];
  clearImports: () => void;
  removeImport: (id: string) => void;
  selectGroup: (id: string | null) => void;
}

/**
 * Renders either a group-level or individual handle overlay depending on
 * selection state. This is the most complex conditional JSX block in the
 * canvas scene.
 */
export function CanvasHandleOverlays({
  imports,
  selectedImportId,
  allImportsSelected,
  selectedGroupId,
  layerGroups,
  zoom,
  panX,
  panY,
  containerW,
  containerH,
  getBedY,
  groupObbAngle,
  groupRotating,
  persistentGroupOBB,
  onGroupMouseDown,
  onHandleMouseDown,
  onRotateHandleMouseDown,
  onGroupHandleMouseDown,
  onGroupRotateHandleMouseDown,
  clearImports,
  removeImport,
  selectGroup,
}: CanvasHandleOverlaysProps) {
  // ── Group selection ────────────────────────────────────────────────────────
  if ((allImportsSelected || !!selectedGroupId) && containerW > 0) {
    const groupedImports = allImportsSelected
      ? imports
      : imports.filter(
          (i) =>
            !!layerGroups
              .find((g) => g.id === selectedGroupId)
              ?.importIds.includes(i.id),
        );

    return (
      <GroupHandleOverlay
        imports={groupedImports.filter((i) => i.visible)}
        zoom={zoom}
        panX={panX}
        panY={panY}
        containerW={containerW}
        containerH={containerH}
        getBedY={getBedY}
        onGroupMouseDown={onGroupMouseDown}
        onGroupHandleMouseDown={onGroupHandleMouseDown}
        onGroupRotateHandleMouseDown={onGroupRotateHandleMouseDown}
        onDelete={
          allImportsSelected
            ? clearImports
            : () => {
                const gids = new Set(
                  layerGroups.find((g) => g.id === selectedGroupId)
                    ?.importIds ?? [],
                );
                imports
                  .filter((i) => gids.has(i.id))
                  .forEach((i) => removeImport(i.id));
                selectGroup(null);
              }
        }
        activeOBB={
          groupRotating
            ? {
                gCx: groupRotating.gCx,
                gCy: groupRotating.gCy,
                gHW: groupRotating.gHW,
                gHH: groupRotating.gHH,
                angle: groupObbAngle,
              }
            : (persistentGroupOBB ?? undefined)
        }
      />
    );
  }

  // ── Single-import selection ──────────────────────────────────────────────────
  if (selectedImportId && containerW > 0) {
    const imp = imports.find((i) => i.id === selectedImportId);
    if (imp) {
      return (
        <HandleOverlay
          imp={imp}
          zoom={zoom}
          panX={panX}
          panY={panY}
          containerW={containerW}
          containerH={containerH}
          getBedY={getBedY}
          onHandleMouseDown={onHandleMouseDown}
          onRotateHandleMouseDown={onRotateHandleMouseDown}
          onDelete={() => removeImport(imp.id)}
        />
      );
    }
  }

  return null;
}
