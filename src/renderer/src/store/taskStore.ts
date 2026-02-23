import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { BackgroundTask } from "../../../types";

interface TaskState {
  tasks: Record<string, BackgroundTask>;
  upsertTask: (task: BackgroundTask) => void;
  removeTask: (id: string) => void;
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
      }),

    activeTasks: () =>
      Object.values(get().tasks).filter((t) => t.status === "running"),
  })),
);
