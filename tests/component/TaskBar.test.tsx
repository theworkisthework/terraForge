import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
