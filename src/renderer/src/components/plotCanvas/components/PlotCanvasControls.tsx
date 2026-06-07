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
        <button
          type="button"
          title="Zoom in (Ctrl+Shift++)"
          aria-label="Zoom in"
          aria-keyshortcuts="Control+Shift++"
          onClick={onZoomIn}
          className="w-8 h-8 rounded bg-panel border border-border-ui text-content text-base font-bold
                     hover:bg-secondary active:bg-secondary-active flex items-center justify-center leading-none"
        >
          +
        </button>
        <button
          type="button"
          title="Zoom out (Ctrl+Shift+-)"
          aria-label="Zoom out"
          aria-keyshortcuts="Control+Shift+-"
          onClick={onZoomOut}
          className="w-8 h-8 rounded bg-panel border border-border-ui text-content text-base font-bold
                     hover:bg-secondary active:bg-secondary-active flex items-center justify-center leading-none"
        >
          −
        </button>
        <button
          type="button"
          title={`Fit to view (Ctrl+0)${fitted ? " - active" : ""}`}
          aria-label="Fit to view"
          aria-keyshortcuts="Control+0"
          aria-pressed={fitted}
          onClick={onFit}
          className={`w-8 h-8 rounded border text-[11px] font-bold flex items-center justify-center leading-none
            ${
              fitted
                ? "bg-accent border-accent text-white"
                : "bg-panel border-border-ui text-content hover:bg-secondary"
            }`}
        >
          ⊡
        </button>
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
