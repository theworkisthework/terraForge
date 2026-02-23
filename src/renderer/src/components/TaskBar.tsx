import { useTaskStore } from "../store/taskStore";

export function TaskBar() {
  const tasks = useTaskStore((s) => s.tasks);
  const activeTasks = Object.values(tasks).filter(
    (t) => t.status === "running",
  );

  if (activeTasks.length === 0) return null;

  return (
    <div className="flex gap-2 px-4 py-1.5 bg-[#0d1117] border-b border-[#0f3460] overflow-x-auto shrink-0">
      {activeTasks.map((task) => (
        <div
          key={task.id}
          className="flex items-center gap-2 bg-[#16213e] border border-[#0f3460] rounded px-3 py-1 min-w-[200px] max-w-[280px] shrink-0"
        >
          {/* Spinner or progress */}
          {task.progress === null ? (
            <span className="w-3 h-3 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin shrink-0" />
          ) : (
            <div className="w-24 h-1.5 bg-[#0f3460] rounded-full overflow-hidden shrink-0">
              <div
                className="h-full bg-[#e94560] transition-all"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          )}

          <span className="text-xs text-gray-300 truncate flex-1">
            {task.label}
          </span>

          {task.progress !== null && (
            <span className="text-xs text-gray-500 shrink-0">
              {task.progress}%
            </span>
          )}

          {/* Cancel button */}
          <button
            onClick={() => window.terraForge.tasks.cancel(task.id)}
            className="text-gray-600 hover:text-[#e94560] text-xs shrink-0"
            title="Cancel"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
