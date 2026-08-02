/** Fixed heading strip shown at the top of the Properties panel. */
interface PanelHeadingProps {
  onHide?: () => void;
}

export function PanelHeading({ onHide }: PanelHeadingProps = {}) {
  return (
    <div className="px-3 py-2 border-b border-border-ui shrink-0 flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-content-muted">
        Properties
      </span>
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          aria-label="Hide properties panel"
          title="Hide properties"
          className="text-xs text-content-muted hover:text-content transition-colors"
        >
          &gt;
        </button>
      )}
    </div>
  );
}
