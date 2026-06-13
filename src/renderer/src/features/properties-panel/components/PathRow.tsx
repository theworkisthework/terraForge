import { Eye, EyeOff, Repeat } from "lucide-react";
import { Button } from "../../../components/ui";

interface PathRowProps {
  label: string;
  visible: boolean;
  strokeEnabled: boolean;
  strokeAvailable: boolean;
  onToggleVisibility: () => void;
  onTogglePassSettings?: () => void;
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
  onTogglePassSettings,
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
      {onTogglePassSettings && (
        <Button
          variant="ghost"
          title="Open path pass settings"
          aria-label="Open path pass settings"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePassSettings();
          }}
        >
          <Repeat size={9} />
        </Button>
      )}
      <Button
        variant="ghost"
        className={`text-[9px] ${
          strokeAvailable
            ? "hover:text-content"
            : "opacity-40 cursor-not-allowed"
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
      </Button>
      <span className="flex-1 min-w-0 text-content-faint truncate">
        {label}
      </span>
      <Button
        variant="ghost"
        className="hover:text-accent"
        title="Remove path"
        onClick={onRemove}
      >
        ✕
      </Button>
    </div>
  );
}
