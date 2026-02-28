import { describe, it, expect, beforeEach, vi } from "vitest";
import { useTaskStore } from "../../../src/renderer/src/store/taskStore";
import { createBackgroundTask } from "../../helpers/factories";

beforeEach(() => {
  useTaskStore.setState({ tasks: {} });
});

describe("taskStore", () => {
  it("upserts a task", () => {
    const task = createBackgroundTask({ id: "t1", status: "running" });
    useTaskStore.getState().upsertTask(task);
    expect(useTaskStore.getState().tasks["t1"]).toBeDefined();
    expect(useTaskStore.getState().tasks["t1"].status).toBe("running");
  });

  it("removes a task", () => {
    useTaskStore.getState().upsertTask(createBackgroundTask({ id: "t1" }));
    useTaskStore.getState().removeTask("t1");
    expect(useTaskStore.getState().tasks["t1"]).toBeUndefined();
  });

  it("cancelTask calls registered callback", () => {
    const task = createBackgroundTask({ id: "t1", status: "running" });
    useTaskStore.getState().upsertTask(task);
    const cb = vi.fn();
    useTaskStore.getState().registerCancelCallback("t1", cb);
    useTaskStore.getState().cancelTask("t1");
    expect(cb).toHaveBeenCalled();
  });

  it("cancelTask falls back to IPC when no callback registered", () => {
    const task = createBackgroundTask({ id: "t1", status: "running" });
    useTaskStore.getState().upsertTask(task);
    useTaskStore.getState().cancelTask("t1");
    expect(window.terraForge.tasks.cancel).toHaveBeenCalledWith("t1");
  });

  it("activeTasks returns only running tasks", () => {
    useTaskStore.getState().upsertTask(createBackgroundTask({ id: "t1", status: "running" }));
    useTaskStore.getState().upsertTask(createBackgroundTask({ id: "t2", status: "completed" }));
    useTaskStore.getState().upsertTask(createBackgroundTask({ id: "t3", status: "running" }));
    const active = useTaskStore.getState().activeTasks();
    expect(active).toHaveLength(2);
    expect(active.map((t) => t.id).sort()).toEqual(["t1", "t3"]);
  });

  it("unregisterCancelCallback removes the callback", () => {
    const cb = vi.fn();
    useTaskStore.getState().registerCancelCallback("t1", cb);
    useTaskStore.getState().unregisterCancelCallback("t1");
    useTaskStore.getState().upsertTask(createBackgroundTask({ id: "t1", status: "running" }));
    useTaskStore.getState().cancelTask("t1");
    expect(cb).not.toHaveBeenCalled();
    // should fall through to IPC
    expect(window.terraForge.tasks.cancel).toHaveBeenCalledWith("t1");
  });
});
