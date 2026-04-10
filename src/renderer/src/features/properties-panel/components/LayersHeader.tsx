interface LayersHeaderProps {
  show: boolean;
  onAddGroup: () => void;
}

export function LayersHeader({ show, onAddGroup }: LayersHeaderProps) {
  if (!show) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-border-ui/50">
      <span className="text-[10px] text-content-faint uppercase tracking-wider flex-1">
        Layers
      </span>
      <button
        className="text-content-faint hover:text-accent text-xs leading-none px-1"
        title="Add layer group"
        onClick={onAddGroup}
      >
        +
      </button>
    </div>
  );
}
