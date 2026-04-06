import { Eye, EyeOff } from "lucide-react";

interface PathRowProps {
  label: string;
  visible: boolean;
  onToggleVisibility: () => void;
  onRemove: () => void;
  indented?: boolean;
}

export function PathRow({
  label,
  visible,
  onToggleVisibility,
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
