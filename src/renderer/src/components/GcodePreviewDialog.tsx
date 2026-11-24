/**
 * GcodePreviewDialog
 *
 * A minimal read-only text viewer for a G-code file — local, or on the
 * machine's internal flash / SD card. Wrapping text, vertical scrollbar,
 * Close, and Download (saves the text to a file the user picks).
 */

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "./ui";
import { useModalFocus } from "../hooks/useModalFocus";

export interface GcodePreviewFile {
  path: string;
  name: string;
  source: string;
}

interface Props {
  file: GcodePreviewFile;
  onClose: () => void;
}

/** Varied line lengths so the placeholder reads as lines of code. */
const SKELETON_WIDTHS = [
  35, 60, 48, 72, 40, 55, 66, 30, 58, 70, 44, 62, 38, 68, 52, 46, 64, 34, 56,
  74, 42, 60, 50, 36,
];

async function loadGcodeText(file: GcodePreviewFile): Promise<string> {
  if (file.source === "local") {
    return window.terraForge.fs.readFile(file.path);
  }
  return window.terraForge.fluidnc.fetchFileText(
    file.path,
    file.source === "sd" ? "sdcard" : "internal",
  );
}

export function GcodePreviewDialog({ file, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    loadGcodeText(file)
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? err));
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const { ref, onKeyDown } = useModalFocus<HTMLDivElement>({
    onEscape: onClose,
  });

  const handleDownload = async () => {
    if (text == null) return;
    setSaveError(null);
    try {
      const dest = await window.terraForge.fs.saveFileDialog(file.name);
      if (!dest) return;
      await window.terraForge.fs.writeFile(dest, text);
    } catch (err) {
      setSaveError(`Save failed: ${String((err as Error)?.message ?? err)}`);
    }
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gcode-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div className="bg-panel border border-border-ui rounded-lg shadow-2xl w-[720px] max-w-[90vw] h-[70vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-ui">
          <h2
            id="gcode-preview-title"
            className="text-content font-semibold text-sm tracking-wide truncate flex-1"
            title={file.path}
          >
            {file.name}
          </h2>
          <Button
            variant="ghost-hover"
            size="icon-sm"
            onClick={handleDownload}
            disabled={text == null}
            title="Download G-code"
            aria-label="Download"
          >
            <Download size={14} strokeWidth={2.25} />
          </Button>
          <Button
            variant="ghost-hover"
            size="icon-sm"
            onClick={onClose}
            data-autofocus
            title="Close"
            aria-label="Close"
          >
            <X size={14} strokeWidth={2.25} />
          </Button>
        </div>

        <div className="flex-1 min-h-0 p-3 flex flex-col">
          {error ? (
            <p className="text-sm text-red-400">Could not load file: {error}</p>
          ) : text == null ? (
            <div
              role="status"
              aria-label="Loading G-code"
              className="flex-1 w-full bg-terminal rounded border border-border-ui p-2 overflow-hidden animate-pulse space-y-2"
            >
              {SKELETON_WIDTHS.map((w, i) => (
                <div
                  key={i}
                  className="h-2.5 rounded bg-secondary"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          ) : (
            <textarea
              readOnly
              value={text}
              spellCheck={false}
              aria-label={`G-code of ${file.name}`}
              className="flex-1 w-full resize-none bg-terminal text-content font-mono text-xs leading-relaxed p-2 rounded border border-border-ui whitespace-pre-wrap break-words overflow-y-auto"
            />
          )}
          {saveError && <p className="text-xs text-red-400 mt-2">{saveError}</p>}
        </div>
      </div>
    </div>
  );
}
