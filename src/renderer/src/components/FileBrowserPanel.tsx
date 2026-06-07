import { useState } from "react";
import { useMachineStore } from "../store/machineStore";
import { useTaskStore } from "../store/taskStore";
import { FsPane } from "./fileBrowser/FsPane";
import { useUploadFileAction } from "./fileBrowser/useUploadFileAction";
import { useVerticalSplit } from "./fileBrowser/useVerticalSplit";

// ── Main panel ─────────────────────────────────────────────────────────────────

export function FileBrowserPanel() {
  const connected = useMachineStore((s) => s.connected);
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const serialMode = connected && activeConfig()?.connection.type === "usb";
  const upsertTask = useTaskStore((s) => s.upsertTask);

  // Collapsed state — internal starts collapsed, sdcard starts open
  const [internalOpen, setInternalOpen] = useState(false);
  const [sdOpen, setSdOpen] = useState(true);

  const { splitPx, containerRef, onDragStart } = useVerticalSplit(200);
  const uploadFn = useUploadFileAction(upsertTask);

  const bothOpen = internalOpen && sdOpen;

  const sharedProps = {
    connected,
    serialMode,
    uploadFn,
    upsertTask,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Title */}
      <div className="flex items-center px-3 py-2 border-b border-border-ui shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-content-muted">
          File Browser
        </span>
      </div>

      {/* Pane container */}
      <div
        ref={containerRef}
        className="flex-1 flex flex-col overflow-hidden min-h-0"
      >
        {/* Internal filesystem pane */}
        <div
          className="flex flex-col overflow-hidden"
          style={
            bothOpen
              ? { height: splitPx, flexShrink: 0 }
              : internalOpen
                ? { flex: 1, minHeight: 0 }
                : { flexShrink: 0 }
          }
        >
          <FsPane
            {...sharedProps}
            label="internal"
            accentColor="blue"
            source="fs"
            listFn={(p) => window.terraForge.fluidnc.listFiles(p)}
            deleteFn={(p) => window.terraForge.fluidnc.deleteFile(p, "fs")}
            open={internalOpen}
            onToggle={() => setInternalOpen((v) => !v)}
          />
        </div>

        {/* Drag handle — only visible when both panes are open */}
        {bothOpen && (
          <div
            onMouseDown={onDragStart}
            className="shrink-0 h-2 flex items-center justify-center cursor-row-resize bg-app hover:bg-secondary group select-none"
            title="Drag to resize"
          >
            <div className="w-10 h-0.5 rounded bg-content-faint group-hover:bg-accent transition-colors" />
          </div>
        )}

        {/* SD card filesystem pane */}
        <div
          className="flex flex-col overflow-hidden"
          style={sdOpen ? { flex: 1, minHeight: 0 } : { flexShrink: 0 }}
        >
          <FsPane
            {...sharedProps}
            label="sdcard"
            accentColor="purple"
            source="sd"
            listFn={(p) => window.terraForge.fluidnc.listSDFiles(p)}
            deleteFn={(p) => window.terraForge.fluidnc.deleteFile(p, "sd")}
            open={sdOpen}
            onToggle={() => setSdOpen((v) => !v)}
          />
        </div>
      </div>
    </div>
  );
}
