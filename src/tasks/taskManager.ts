import { EventEmitter } from "events";
import type { BackgroundTask, TaskType } from "../types";

/**
 * How long a finished task is kept, so that whoever ran it can still read
 * its final state, before it is forgotten.
 */
const FORGET_AFTER_MS = 5000;

/**
 * Tracks all background tasks (upload, download, gcode gen, etc.)
 * and emits 'task-update' events that the main process forwards to the renderer.
 *
 * A task that has finished — completed, failed or cancelled — is forgotten a
 * few seconds later, so that the map does not grow for as long as the app runs.
 */
export class TaskManager extends EventEmitter {
  private tasks = new Map<string, BackgroundTask>();
  private cancelRequests = new Set<string>();
  private cancelHandlers = new Map<string, () => void>();

  /** Drops the task, and any cancel request against it, a little later. */
  private forgetLater(id: string): void {
    setTimeout(() => {
      this.tasks.delete(id);
      this.cancelRequests.delete(id);
    }, FORGET_AFTER_MS).unref?.();
  }

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
    this.cancelHandlers.delete(id);
    this.cancelRequests.delete(id);
    this.emit("task-update", { ...task });
    this.forgetLater(id);
  }

  fail(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = "error";
    task.error = error;
    this.cancelHandlers.delete(id);
    this.cancelRequests.delete(id);
    this.emit("task-update", { ...task });
    this.forgetLater(id);
  }

  cancel(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = "cancelled";
    this.cancelRequests.add(id);
    const handler = this.cancelHandlers.get(id);
    if (handler) {
      try {
        handler();
      } catch {
        // no-op: cancellation must remain best-effort
      }
    }
    this.cancelHandlers.delete(id);
    this.emit("task-update", { ...task });
    // The cancel request stays readable until then: the operation that was
    // cancelled checks it once it has stopped.
    this.forgetLater(id);
  }

  registerCancelHandler(id: string, handler: () => void): void {
    this.cancelHandlers.set(id, handler);
  }

  clearCancelHandler(id: string): void {
    this.cancelHandlers.delete(id);
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
