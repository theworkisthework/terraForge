import { Button } from "../../ui";

type PlotCanvasControlsProps = {
  fitted: boolean;
  zoom: number;
  spaceDown: boolean;
  onZoomIn: (e: React.MouseEvent) => void;
  onZoomOut: (e: React.MouseEvent) => void;
  onFit: (e: React.MouseEvent) => void;
};

export function PlotCanvasControls({
  fitted,
  zoom,
  spaceDown,
  onZoomIn,
  onZoomOut,
  onFit,
}: PlotCanvasControlsProps) {
  return (
    <>
      <div
        className="absolute bottom-9 right-4 flex flex-col gap-1 z-10"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost-hover"
          size="icon-md"
          title="Zoom in (Ctrl+Shift++)"
          aria-label="Zoom in"
          aria-keyshortcuts="Control+Shift++"
          onClick={onZoomIn}
          className="bg-panel border border-border-ui text-base font-bold"
        >
          +
        </Button>
        <Button
          variant="ghost-hover"
          size="icon-md"
          title="Zoom out (Ctrl+Shift+-)"
          aria-label="Zoom out"
          aria-keyshortcuts="Control+Shift+-"
          onClick={onZoomOut}
          className="bg-panel border border-border-ui text-base font-bold"
        >
          −
        </Button>
        <Button
          variant="toggle"
          size="icon-md"
          selected={fitted}
          title={`Fit to view (Ctrl+0)${fitted ? " - active" : ""}`}
          aria-label="Fit to view"
          aria-keyshortcuts="Control+0"
          aria-pressed={fitted}
          onClick={onFit}
          className="text-[11px] font-bold leading-none"
        >
          ⊡
        </Button>
      </div>

      <div className="absolute bottom-4 left-4 z-10 text-[10px] text-content-faint font-mono pointer-events-none">
        {Math.round(zoom * 100)}%
      </div>

      {spaceDown && (
        <div className="absolute inset-0 z-20 pointer-events-none flex items-start justify-center pt-3">
          <span className="text-[10px] text-content-muted bg-app/80 px-2 py-0.5 rounded">
            Pan mode - drag to pan - release Space to exit
          </span>
        </div>
      )}
    </>
  );
}
