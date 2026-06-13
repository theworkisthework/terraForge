import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Palette,
} from "lucide-react";
import { Button } from "../../../components/ui";
import type { GcodeToolpath } from "../../../utils/gcodeParser";
import { estimateDuration, formatBytes } from "../utils/toolpathMetrics";

interface ToolpathSectionProps {
  toolpath: GcodeToolpath;
  fileName: string;
  selected: boolean;
  visible: boolean;
  colorized: boolean;
  opacity: number;
  isJobActive: boolean;
  fallbackFeedrate: number;
  onToggleSelected: () => void;
  onSetVisible: (visible: boolean) => void;
  onSetColorized: (colorized: boolean) => void;
  onSetOpacity: (opacity: number) => void;
  onClear: () => void;
}

export function ToolpathSection({
  toolpath,
  fileName,
  selected,
  visible,
  colorized,
  opacity,
  isJobActive,
  fallbackFeedrate,
  onToggleSelected,
  onSetVisible,
  onSetColorized,
  onSetOpacity,
  onClear,
}: ToolpathSectionProps) {
  const duration = estimateDuration(toolpath, fallbackFeedrate);

  return (
    <div className="border-b border-border-ui/30">
      <div
        className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-secondary/20 ${selected ? "bg-secondary/20" : ""}`}
        onClick={onToggleSelected}
      >
        <Button
          aria-expanded={selected}
          aria-label={
            selected ? "Collapse toolpath details" : "Expand toolpath details"
          }
          variant="ghost"
          className="w-4 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelected();
          }}
        >
          {selected ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </Button>

        <FileText className="shrink-0 text-sky-400" size={11} strokeWidth={2} />

        <span
          className="flex-1 min-w-0 text-[10px] truncate text-content"
          title={fileName}
        >
          {fileName}
        </span>

        <Button
          variant="ghost"
          className="ml-1 shrink-0"
          title={
            colorized
              ? "Disable colorized toolpath"
              : "Enable colorized toolpath"
          }
          aria-label={
            colorized
              ? "Disable colorized toolpath"
              : "Enable colorized toolpath"
          }
          onClick={(e) => {
            e.stopPropagation();
            onSetColorized(!colorized);
          }}
        >
          <Palette
            size={11}
            className={colorized ? "text-sky-400" : "text-content-faint"}
          />
        </Button>

        <Button
          variant="ghost"
          className="ml-1 shrink-0"
          title={visible ? "Hide toolpath" : "Show toolpath"}
          aria-label={visible ? "Hide toolpath" : "Show toolpath"}
          onClick={(e) => {
            e.stopPropagation();
            onSetVisible(!visible);
          }}
        >
          {visible ? <Eye size={11} /> : <EyeOff size={11} />}
        </Button>

        <Button
          variant="ghost"
          className={`ml-1 shrink-0 ${
            isJobActive ? "opacity-30 cursor-not-allowed" : "hover:text-accent"
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
        </Button>
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

          <div className="flex items-center gap-2 text-[10px] pt-1">
            <span className="text-content-faint whitespace-nowrap">
              Opacity
            </span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round(opacity * 100)}
              onChange={(e) => onSetOpacity(Number(e.target.value) / 100)}
              className="flex-1 accent-accent"
              aria-label="Toolpath opacity"
            />
            <span className="text-content font-mono w-8 text-right">
              {Math.round(opacity * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
