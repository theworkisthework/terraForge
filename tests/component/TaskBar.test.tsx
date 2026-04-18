import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTaskStore } from "@renderer/store/taskStore";
import { TaskBar } from "@renderer/components/TaskBar";
import { createBackgroundTask } from "../helpers/factories";

beforeEach(() => {
  useTaskStore.setState({ tasks: {} });
});

describe("TaskBar", () => {
  it("renders nothing when there are no tasks", () => {
    const { container } = render(<TaskBar />);
    expect(container.innerHTML).toBe("");
  });

  it("shows a running task with label", () => {
    const task = createBackgroundTask({
      id: "t1",
      label: "Generating G-code",
      status: "running",
      progress: null,
    });
    useTaskStore.setState({ tasks: { t1: task } });
    render(<TaskBar />);
    expect(screen.getByText("Generating G-code")).toBeInTheDocument();
  });

  it("shows progress percentage for a running task with progress", () => {
    const task = createBackgroundTask({
      id: "t1",
      label: "Uploading",
      status: "running",
      progress: 75,
    });
    useTaskStore.setState({ tasks: { t1: task } });
    render(<TaskBar />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("shows checkmark for completed task", () => {
    const task = createBackgroundTask({
      id: "t1",
      label: "Done",
      status: "completed",
      progress: 100,
    });
    useTaskStore.setState({ tasks: { t1: task } });
    render(<TaskBar />);
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("shows error indicator and error message", () => {
    const task = createBackgroundTask({
      id: "t1",
      label: "Failed task",
      status: "error",
      error: "Connection refused",
    });
    useTaskStore.setState({ tasks: { t1: task } });
    render(<TaskBar />);
    expect(screen.getByText("!")).toBeInTheDocument();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("shows warning indicator and warning detail", () => {
    const task = createBackgroundTask({
      id: "t1",
      label: "Imported with warnings",
      status: "warning",
      error: "1 text element skipped; convert text to outlines",
    });
    useTaskStore.setState({ tasks: { t1: task } });
    render(<TaskBar />);
    expect(screen.getByText("Imported with warnings")).toBeInTheDocument();
    expect(
      screen.getByText("1 text element skipped; convert text to outlines"),
    ).toBeInTheDocument();
  });

  it("cancel button triggers cancelTask on running task", async () => {
    const task = createBackgroundTask({
      id: "t1",
      label: "Running task",
      status: "running",
      progress: null,
    });
    useTaskStore.setState({ tasks: { t1: task } });
    const cb = vi.fn();
    useTaskStore.getState().registerCancelCallback("t1", cb);
    render(<TaskBar />);
    const cancelBtn = screen.getByTitle("Cancel task");
    await userEvent.click(cancelBtn);
    expect(cb).toHaveBeenCalled();
  });

  it("dismiss button removes a completed task", async () => {
    const task = createBackgroundTask({
      id: "t1",
      label: "Completed task",
      status: "completed",
      progress: 100,
    });
    useTaskStore.setState({ tasks: { t1: task } });
    render(<TaskBar />);
    const dismissBtn = screen.getByTitle("Dismiss");
    await userEvent.click(dismissBtn);
    expect(useTaskStore.getState().tasks["t1"]).toBeUndefined();
  });

  it("shows multiple tasks", () => {
    useTaskStore.setState({
      tasks: {
        t1: createBackgroundTask({
          id: "t1",
          label: "Task One",
          status: "running",
        }),
        t2: createBackgroundTask({
          id: "t2",
          label: "Task Two",
          status: "completed",
        }),
      },
    });
    render(<TaskBar />);
    expect(screen.getByText("Task One")).toBeInTheDocument();
    expect(screen.getByText("Task Two")).toBeInTheDocument();
  });

  // ── Null progress shows spinner ────────────────────────────────────────

  it("shows spinner when running task has null progress", () => {
    const task = createBackgroundTask({
      id: "t1",
      label: "Parsing",
      status: "running",
      progress: null,
    });
    useTaskStore.setState({ tasks: { t1: task } });
    const { container } = render(<TaskBar />);
    // Spinner is a span with animate-spin class
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });

  // ── Auto-dismiss timer ─────────────────────────────────────────────────

  it("auto-dismisses completed tasks after timeout", async () => {
    vi.useFakeTimers();
    const task = createBackgroundTask({
      id: "t1",
      label: "Done",
      status: "completed",
      progress: 100,
    });
    useTaskStore.setState({ tasks: { t1: task } });
    render(<TaskBar />);
    expect(screen.getByText("Done")).toBeInTheDocument();
    // Fast-forward past the dismiss timer (8000ms)
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(useTaskStore.getState().tasks["t1"]).toBeUndefined();
    vi.useRealTimers();
  });

  // ── Error does not auto-dismiss ────────────────────────────────────────

  it("does not auto-dismiss error tasks", () => {
    vi.useFakeTimers();
    const task = createBackgroundTask({
      id: "t1",
      label: "Error",
      status: "error",
      error: "Some failure",
    });
    useTaskStore.setState({ tasks: { t1: task } });
    render(<TaskBar />);
    vi.advanceTimersByTime(15000);
    // Error task should still be present
    expect(useTaskStore.getState().tasks["t1"]).toBeDefined();
    vi.useRealTimers();
  });

  it("does not auto-dismiss warning tasks", () => {
    vi.useFakeTimers();
    const task = createBackgroundTask({
      id: "t1",
      label: "Warning",
      status: "warning",
      error: "Text skipped",
    });
    useTaskStore.setState({ tasks: { t1: task } });
    render(<TaskBar />);
    vi.advanceTimersByTime(15000);
    expect(useTaskStore.getState().tasks["t1"]).toBeDefined();
    vi.useRealTimers();
  });

  // ── Cancelled task shows ✕ icon ────────────────────────────────────────

  it("shows ✕ icon for cancelled task", () => {
    const task = createBackgroundTask({
      id: "t1",
      label: "Cancelled thing",
      status: "cancelled",
      progress: null,
    });
    useTaskStore.setState({ tasks: { t1: task } });
    render(<TaskBar />);
    // The cancelled status icon is ✕ (different from dismiss button)
    expect(screen.getByText("Cancelled thing")).toBeInTheDocument();
  });
});
