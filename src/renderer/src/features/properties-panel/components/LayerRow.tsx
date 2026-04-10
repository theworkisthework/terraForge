import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";

interface LayerRowProps {
  name: string;
  visible: boolean;
  pathCount: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleVisible: () => void;
}

export function LayerRow({
  name,
  visible,
  pathCount,
  expanded,
  onToggleExpanded,
  onToggleVisible,
}: LayerRowProps) {
  return (
    <div className="flex items-center gap-1 py-0.5 text-[9px]">
      <button
        className="text-content-faint hover:text-content text-[9px] w-3 shrink-0"
        title={expanded ? "Collapse layer" : "Expand layer"}
        onClick={onToggleExpanded}
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
      <span
        className="text-content-faint hover:text-content cursor-pointer"
        onClick={onToggleVisible}
        title="Toggle layer visibility"
      >
        {visible ? <Eye size={9} /> : <EyeOff size={9} />}
      </span>
      <span
        className="flex-1 min-w-0 text-[9px] font-medium text-content-muted truncate cursor-pointer"
        onClick={onToggleExpanded}
      >
        {name}
      </span>
      <span className="text-[8px] text-content-faint shrink-0">
        {pathCount}p
      </span>
    </div>
  );
}
