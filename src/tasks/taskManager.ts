import { EventEmitter } from "events";
import type { BackgroundTask, TaskType } from "../types";

/**
 * Tracks all background tasks (upload, download, gcode gen, etc.)
 * and emits 'task-update' events that the main process forwards to the renderer.
 */
export class TaskManager extends EventEmitter {
  private tasks = new Map<string, BackgroundTask>();
  private cancelRequests = new Set<string>();

  create(id: string, type: TaskType, label: string): BackgroundTask {
    const task: BackgroundTask = {
      id,
      type,
      label,
      progress: null,
      status: "running",
    };
    this.tasks.set(id, task);
    this.emit("task-update", task);
    return task;
  }

  update(
    id: string,
    patch: Partial<Pick<BackgroundTask, "progress" | "status" | "error">>,
  ): void {
    const task = this.tasks.get(id);
    if (!task || task.status !== "running") return;
    Object.assign(task, patch);
    this.emit("task-update", { ...task });
  }

  complete(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = "completed";
    task.progress = 100;
    this.emit("task-update", { ...task });
    // Clean up after a short delay
    setTimeout(() => this.tasks.delete(id), 5000);
  }

  fail(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = "error";
    task.error = error;
    this.emit("task-update", { ...task });
  }

  cancel(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = "cancelled";
    this.cancelRequests.add(id);
    this.emit("task-update", { ...task });
  }

  isCancelled(id: string): boolean {
    return this.cancelRequests.has(id);
  }

  get(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  getAll(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }
}
