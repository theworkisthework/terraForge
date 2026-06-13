import { Button } from "../../../components/ui";

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
      <Button
        variant="ghost"
        className="text-xs leading-none px-1 hover:text-accent"
        title="Add layer group"
        onClick={onAddGroup}
      >
        +
      </Button>
    </div>
  );
}
