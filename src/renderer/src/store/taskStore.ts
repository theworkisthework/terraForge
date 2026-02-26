import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { BackgroundTask } from "../../../types";

/**
 * Cancel callbacks live outside immer state entirely — immer cannot safely
 * handle functions (closures) inside its draft/freeze cycle.
 */
const cancelCallbacks = new Map<string, () => void>();

interface TaskState {
  tasks: Record<string, BackgroundTask>;
  upsertTask: (task: BackgroundTask) => void;
  removeTask: (id: string) => void;
  registerCancelCallback: (id: string, fn: () => void) => void;
  unregisterCancelCallback: (id: string) => void;
  /** Cancel a task: calls the renderer-side callback if registered, otherwise
   *  falls back to the IPC path for tasks owned by the main process. */
  cancelTask: (id: string) => void;
  activeTasks: () => BackgroundTask[];
}

export const useTaskStore = create<TaskState>()(
  immer((set, get) => ({
    tasks: {},

    upsertTask: (task) =>
      set((state) => {
        state.tasks[task.id] = task;
      }),

    removeTask: (id) =>
      set((state) => {
        delete state.tasks[id];
        cancelCallbacks.delete(id);
      }),

    registerCancelCallback: (id, fn) => {
      cancelCallbacks.set(id, fn);
    },

    unregisterCancelCallback: (id) => {
      cancelCallbacks.delete(id);
    },

    cancelTask: (id) => {
      const cb = cancelCallbacks.get(id);
      if (cb) {
        cb();
        cancelCallbacks.delete(id);
      } else {
        window.terraForge.tasks.cancel(id);
      }
    },

    activeTasks: () =>
      Object.values(get().tasks).filter((t) => t.status === "running"),
  })),
);
