interface JobFileIndicatorProps {
  /** The effective job file (may come from file browser or canvas toolpath). */
  effectiveJobFile: {
    path: string;
    source: string;
    name: string;
  } | null;
  /** Whether the file has a recognised G-code extension. */
  jobFileValid: boolean;
  /** True when the machine is actively running (hide file info). */
  isActive: boolean;
}

/**
 * Displays the currently selected G-code file name, source icon, and validity.
 * Hidden while a job is active.
 */
export function JobFileIndicator({
  effectiveJobFile,
  jobFileValid,
  isActive,
}: JobFileIndicatorProps) {
  if (isActive) return null;

  return (
    <div
      className="text-[9px] truncate px-0.5 -mt-1 mb-0.5"
      title={effectiveJobFile?.path ?? undefined}
    >
      {!effectiveJobFile ? (
        <span className="italic text-content-faint">
          No file selected — pick one in File Browser
        </span>
      ) : jobFileValid ? (
        <span className="text-content">
          {effectiveJobFile.source === "local" ? "🖥" : "📄"}{" "}
          {effectiveJobFile.name}
          {effectiveJobFile.source === "local" && (
            <span className="text-content-faint ml-1">
              (local — will upload)
            </span>
          )}
        </span>
      ) : (
        <span className="text-amber-400">
          ⚠ {effectiveJobFile.name} — not a G-code file
        </span>
      )}
    </div>
  );
}
