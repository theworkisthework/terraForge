import { ChevronDown, ChevronRight, Eye, EyeOff, Repeat } from "lucide-react";

interface ColorGroupRowProps {
  color: string;
  visible: boolean;
  pathCount: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleVisible: () => void;
  onTogglePassSettings?: () => void;
}

/**
 * Renders a collapsible color group header.
 * Shows a color swatch and path count.
 */
export function ColorGroupRow({
  color,
  visible,
  pathCount,
  expanded,
  onToggleExpanded,
  onToggleVisible,
  onTogglePassSettings,
}: ColorGroupRowProps) {
  return (
    <div className="flex items-center gap-1 py-0.5 text-[9px]">
      <button
        className="text-content-faint hover:text-content text-[9px] w-3 shrink-0"
        title={expanded ? "Collapse color group" : "Expand color group"}
        onClick={onToggleExpanded}
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
      <span
        className="text-content-faint hover:text-content cursor-pointer"
        onClick={onToggleVisible}
        title="Toggle color group visibility"
      >
        {visible ? <Eye size={9} /> : <EyeOff size={9} />}
      </span>
      <button
        className="text-content-faint hover:text-content"
        title="Open colour pass settings"
        aria-label="Open colour pass settings"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePassSettings?.();
        }}
      >
        <Repeat size={9} />
      </button>
      <div
        className="w-3 h-3 rounded border border-content-faint shrink-0"
        style={{ backgroundColor: color }}
        title={`Color: ${color}`}
      />
      <span
        className="flex-1 min-w-0 text-[9px] font-medium text-content-muted truncate cursor-pointer font-mono text-[8px]"
        onClick={onToggleExpanded}
      >
        {color}
      </span>
      <span className="text-[8px] text-content-faint shrink-0">
        {pathCount}p
      </span>
    </div>
  );
}
