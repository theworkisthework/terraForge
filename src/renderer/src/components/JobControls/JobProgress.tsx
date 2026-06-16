interface JobProgressProps {
  /** True when the machine is actively running or held (shows active progress). */
  isActive: boolean;
  /** True when the g-code preview is being loaded (shows loading bar). */
  gcodePreviewLoading: boolean;
  /** True when the machine is held/paused (vs running). */
  isHeld: boolean;
  /** 0-100 progress percentage, or null if indeterminate. */
  progress: number | null;
  /** Current line number, or null. */
  lineNum: number | null;
  /** Total line count, or null. */
  lineTotal: number | null;
}

/**
 * Preview-loading bar (shown while fetching toolpath) and active-job progress
 * bar (shown while machine is running or held).
 */
export function JobProgress({
  isActive,
  gcodePreviewLoading,
  isHeld,
  progress,
  lineNum,
  lineTotal,
}: JobProgressProps) {
  return (
    <>
      {/* Preview-loading bar */}
      {!isActive && gcodePreviewLoading && (
        <div className="flex flex-col gap-1 mb-1">
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-accent animate-pulse" />
          </div>
          <div className="text-[9px] text-content-faint">Loading preview…</div>
        </div>
      )}

      {/* Active-job progress bar */}
      {isActive && (
        <div className="flex flex-col gap-1 mb-1">
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            {progress != null ? (
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            ) : (
              <div className="h-full w-1/3 bg-accent animate-pulse" />
            )}
          </div>
          <div className="flex justify-between text-[9px] text-content-faint">
            <span>{isHeld ? "Paused" : "Running"}</span>
            <span>
              {lineNum != null && lineTotal != null
                ? `line ${lineNum.toLocaleString()} / ${lineTotal.toLocaleString()}${progress != null ? ` (${progress}%)` : ""}`
                : ""}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
