import { useEffect, useRef } from "react";
import { useTaskStore } from "../store/taskStore";
import type { BackgroundTask } from "../../../../types";

/** Completed / cancelled toasts auto-dismiss after this delay. */
const DISMISS_MS = 8000;
/** Errors are never auto-dismissed — user must click ✕. */
const AUTO_DISMISS_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "cancelled",
]);

function Toast({ task }: { task: BackgroundTask }) {
  const removeTask = useTaskStore((s) => s.removeTask);
  const cancelTask = useTaskStore((s) => s.cancelTask);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (task.status !== "running") {
      if (AUTO_DISMISS_STATUSES.has(task.status)) {
        timerRef.current = setTimeout(() => removeTask(task.id), DISMISS_MS);
      }
      // errors stay until the user explicitly dismisses them
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [task.status, task.id, removeTask]);

  const isRunning = task.status === "running";
  const isDone = task.status === "completed";
  const isCancelled = task.status === "cancelled";
  const isError = task.status === "error";

  const borderColor = isError
    ? "border-accent/50"
    : isDone
      ? "border-green-700/50"
      : isCancelled
        ? "border-accent/30"
        : "border-border-ui";

  return (
    <div
      className={`flex items-center gap-2.5 bg-panel/95 backdrop-blur border ${
        borderColor
      } rounded-lg px-3 py-2 shadow-xl w-[280px]`}
    >
      {/* Status icon / spinner / progress bar */}
      {isRunning && task.progress === null && (
        <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {isRunning && task.progress !== null && (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-200"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <span className="text-[10px] text-content-faint w-7 text-right">
            {task.progress}%
          </span>
        </div>
      )}
      {isDone && (
        <span className="text-green-400 text-sm shrink-0 leading-none">✓</span>
      )}
      {isCancelled && (
        <span className="text-accent text-sm shrink-0 leading-none">✕</span>
      )}
      {isError && (
        <span className="text-accent text-xs shrink-0 leading-none font-bold">
          !
        </span>
      )}

      {/* Label + optional error detail */}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs text-content truncate" title={task.label}>
          {task.label}
        </span>
        {isError && task.error && (
          <span
            className="text-[10px] text-accent/80 truncate"
            title={task.error}
          >
            {task.error}
          </span>
        )}
      </div>

      {/* Cancel (running) or dismiss (finished) */}
      {isRunning ? (
        <button
          onClick={() => cancelTask(task.id)}
          className="text-content-faint hover:text-accent text-xs shrink-0 leading-none ml-1"
          aria-label="Cancel task"
          title="Cancel task"
        >
          ✕
        </button>
      ) : (
        <button
          onClick={() => removeTask(task.id)}
          className="text-content-faint hover:text-content-muted text-xs shrink-0 leading-none ml-1"
          aria-label="Dismiss"
          title="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function TaskBar() {
  const tasks = useTaskStore((s) => s.tasks);
  const visible = Object.values(tasks);

  if (visible.length === 0) return null;

  return (
    <div className="absolute top-4 right-4 z-60 flex flex-col gap-2 pointer-events-none">
      {visible.map((task) => (
        <div key={task.id} className="pointer-events-auto">
          <Toast task={task} />
        </div>
      ))}
    </div>
  );
}
