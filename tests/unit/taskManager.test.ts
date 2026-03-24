import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskManager } from "../../src/tasks/taskManager";

describe("TaskManager", () => {
  let tm: TaskManager;

  beforeEach(() => {
    vi.useFakeTimers();
    tm = new TaskManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── create ──────────────────────────────────────────────────────────────

  it("creates a task with running status and emits event", () => {
    const handler = vi.fn();
    tm.on("task-update", handler);
    const task = tm.create("t1", "gcode-generate", "Generate G-code");
    expect(task.id).toBe("t1");
    expect(task.status).toBe("running");
    expect(task.progress).toBeNull();
    expect(handler).toHaveBeenCalledWith(task);
  });

  it("stores the task so it can be retrieved", () => {
    tm.create("t1", "gcode-generate", "Test");
    expect(tm.get("t1")).toBeDefined();
    expect(tm.get("t1")!.id).toBe("t1");
  });

  // ── update ──────────────────────────────────────────────────────────────

  it("updates progress on a running task", () => {
    tm.create("t1", "gcode-generate", "Test");
    const handler = vi.fn();
    tm.on("task-update", handler);
    tm.update("t1", { progress: 50 });
    expect(tm.get("t1")!.progress).toBe(50);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1", progress: 50 }),
    );
  });

  it("ignores update on non-existent task", () => {
    expect(() => tm.update("missing", { progress: 10 })).not.toThrow();
  });

  it("ignores update on a completed task", () => {
    tm.create("t1", "gcode-generate", "Test");
    tm.complete("t1");
    tm.update("t1", { progress: 99 });
    expect(tm.get("t1")!.progress).toBe(100); // stayed at 100 from complete
  });

  // ── complete ────────────────────────────────────────────────────────────

  it("marks status as completed and progress as 100", () => {
    tm.create("t1", "gcode-generate", "Test");
    tm.complete("t1");
    const task = tm.get("t1")!;
    expect(task.status).toBe("completed");
    expect(task.progress).toBe(100);
  });

  it("auto-deletes the task after 5 seconds", () => {
    tm.create("t1", "gcode-generate", "Test");
    tm.complete("t1");
    expect(tm.get("t1")).toBeDefined();
    vi.advanceTimersByTime(5000);
    expect(tm.get("t1")).toBeUndefined();
  });

  // ── fail ────────────────────────────────────────────────────────────────

  it("marks status as error with message", () => {
    tm.create("t1", "gcode-generate", "Test");
    tm.fail("t1", "Something went wrong");
    const task = tm.get("t1")!;
    expect(task.status).toBe("error");
    expect(task.error).toBe("Something went wrong");
  });

  // ── cancel ──────────────────────────────────────────────────────────────

  it("marks status as cancelled and registers cancellation", () => {
    tm.create("t1", "gcode-generate", "Test");
    tm.cancel("t1");
    expect(tm.get("t1")!.status).toBe("cancelled");
    expect(tm.isCancelled("t1")).toBe(true);
  });

  // ── getAll ──────────────────────────────────────────────────────────────

  it("returns all current tasks", () => {
    tm.create("t1", "gcode-generate", "One");
    tm.create("t2", "file-upload", "Two");
    const all = tm.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });

  // ── no-op on unknown task ids ────────────────────────────────────────────

  it("fail is a no-op for unknown task", () => {
    expect(() => tm.fail("nonexistent", "oops")).not.toThrow();
  });

  it("cancel is a no-op for unknown task", () => {
    expect(() => tm.cancel("nonexistent")).not.toThrow();
    expect(tm.isCancelled("nonexistent")).toBe(false);
  });

  it("complete is a no-op for unknown task", () => {
    expect(() => tm.complete("nonexistent")).not.toThrow();
  });

  // ── Multiple concurrent tasks ──────────────────────────────────────────

  it("tracks multiple concurrent tasks independently", () => {
    tm.create("t1", "gcode-generate", "Generate");
    tm.create("t2", "file-upload", "Upload");
    tm.update("t1", { progress: 50 });
    tm.update("t2", { progress: 30 });
    expect(tm.get("t1")!.progress).toBe(50);
    expect(tm.get("t2")!.progress).toBe(30);
    tm.complete("t1");
    expect(tm.get("t1")!.status).toBe("completed");
    expect(tm.get("t2")!.status).toBe("running");
  });
});
