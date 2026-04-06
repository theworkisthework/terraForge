import { ChevronDown, ChevronRight } from "lucide-react";
import type { GcodeToolpath } from "../../../utils/gcodeParser";
import { estimateDuration, formatBytes } from "../utils/toolpathMetrics";

interface ToolpathSectionProps {
  toolpath: GcodeToolpath;
  fileName: string;
  selected: boolean;
  isJobActive: boolean;
  fallbackFeedrate: number;
  onToggleSelected: () => void;
  onClear: () => void;
}

export function ToolpathSection({
  toolpath,
  fileName,
  selected,
  isJobActive,
  fallbackFeedrate,
  onToggleSelected,
  onClear,
}: ToolpathSectionProps) {
  const duration = estimateDuration(toolpath, fallbackFeedrate);

  return (
    <div className="border-b border-border-ui/30">
      <div
        className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-secondary/20 ${selected ? "bg-secondary/20" : ""}`}
        onClick={onToggleSelected}
      >
        <button
          aria-expanded={selected}
          aria-label={
            selected ? "Collapse toolpath details" : "Expand toolpath details"
          }
          className="text-content-faint hover:text-content text-[10px] w-4 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelected();
          }}
        >
          {selected ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>

        <svg
          className="shrink-0 text-sky-400"
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>

        <span
          className="flex-1 min-w-0 text-[10px] truncate text-content"
          title={fileName}
        >
          {fileName}
        </span>

        <button
          className={`ml-1 shrink-0 ${
            isJobActive
              ? "text-content-faint opacity-30 cursor-not-allowed"
              : "text-content-faint hover:text-accent"
          }`}
          title={
            isJobActive
              ? "Cannot clear toolpath while job is running"
              : "Clear toolpath"
          }
          disabled={isJobActive}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
        >
          ✕
        </button>
      </div>

      {selected && (
        <div className="pl-6 pr-3 pb-2 pt-1 border-t border-border-ui/20 space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-content-faint">Size</span>
            <span className="text-content font-mono">
              {formatBytes(toolpath.fileSizeBytes)}
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-content-faint">Lines</span>
            <span className="text-content font-mono">
              {toolpath.lineCount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-content-faint">Est. duration</span>
            <span className="text-content font-mono">{duration}</span>
          </div>
          {toolpath.feedrate > 0 && (
            <div className="flex justify-between text-[10px]">
              <span className="text-content-faint">Feedrate</span>
              <span className="text-content font-mono">
                {Math.round(toolpath.feedrate)} mm/min
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
