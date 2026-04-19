import { Eye, EyeOff } from "lucide-react";

interface PathRowProps {
  label: string;
  visible: boolean;
  strokeEnabled: boolean;
  strokeAvailable: boolean;
  onToggleVisibility: () => void;
  onToggleStroke: () => void;
  onRemove: () => void;
  indented?: boolean;
}

export function PathRow({
  label,
  visible,
  strokeEnabled,
  strokeAvailable,
  onToggleVisibility,
  onToggleStroke,
  onRemove,
  indented = false,
}: PathRowProps) {
  return (
    <div
      className={`${indented ? "pl-3 " : ""}flex items-center gap-1 py-0.5 text-[9px]`}
    >
      <span
        className="text-content-faint hover:text-content cursor-pointer"
        aria-label={visible ? "Hide path" : "Show path"}
        onClick={onToggleVisibility}
        title="Toggle path visibility"
      >
        {visible ? <Eye size={9} /> : <EyeOff size={9} />}
      </span>
      <button
        className={`text-[9px] ${
          strokeAvailable
            ? "text-content-faint hover:text-content cursor-pointer"
            : "text-content-faint/40 cursor-not-allowed"
        }`}
        aria-label={
          strokeEnabled ? "Disable path stroke" : "Enable path stroke"
        }
        title={
          strokeAvailable
            ? "Toggle path stroke"
            : "No source stroke; enable generated stroke at import level"
        }
        onClick={onToggleStroke}
        disabled={!strokeAvailable}
      >
        S
      </button>
      <span className="flex-1 min-w-0 text-content-faint truncate">
        {label}
      </span>
      <button
        className="text-content-faint hover:text-accent"
        title="Remove path"
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}
