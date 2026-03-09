import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMachineStore } from "@renderer/store/machineStore";
import { useTaskStore } from "@renderer/store/taskStore";
import { useCanvasStore } from "@renderer/store/canvasStore";
import { FileBrowserPanel } from "@renderer/components/FileBrowserPanel";
import { createMachineConfig } from "../helpers/factories";

beforeEach(() => {
  const cfg = createMachineConfig({
    connection: { type: "wifi", host: "fluidnc.local", port: 80 },
  });
  useMachineStore.setState({
    configs: [cfg],
    activeConfigId: cfg.id,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
  });
  useTaskStore.setState({ tasks: {} });
  useCanvasStore.setState({
    imports: [],
    selectedImportId: null,
    selectedPathId: null,
    gcodeToolpath: null,
  });
  vi.clearAllMocks();
});

describe("FileBrowserPanel", () => {
  it("renders the File Browser heading", () => {
    render(<FileBrowserPanel />);
    expect(screen.getByText("File Browser")).toBeInTheDocument();
  });

  it("renders internal and sdcard sections", () => {
    render(<FileBrowserPanel />);
    expect(screen.getByText(/internal/i)).toBeInTheDocument();
    expect(screen.getByText(/sdcard/i)).toBeInTheDocument();
  });

  it("shows 'Not connected' when disconnected", () => {
    render(<FileBrowserPanel />);
    const msgs = screen.getAllByText("Not connected.");
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("renders upload buttons for both filesystems", async () => {
    render(<FileBrowserPanel />);
    // Internal starts collapsed — open it by clicking its section header
    await userEvent.click(screen.getByText(/internal/i));
    const btns = screen.getAllByText(/Upload to \//);
    expect(btns).toHaveLength(2);
  });

  // ── File listing ──────────────────────────────────────────────────────

  it("loads and displays file list when connected", async () => {
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        name: "config.yaml",
        path: "/config.yaml",
        size: 128,
        isDirectory: false,
      },
    ]);
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        name: "test.gcode",
        path: "/test.gcode",
        size: 5000,
        isDirectory: false,
      },
    ]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    // SD card pane (open by default)
    await waitFor(() => {
      expect(screen.getByText("test.gcode")).toBeInTheDocument();
    });
    // Open the internal pane to see its files
    await userEvent.click(screen.getByText(/internal/i));
    await waitFor(() => {
      expect(screen.getByText("config.yaml")).toBeInTheDocument();
    });
  });

  it("shows directory entries with folder icon", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "subdir", path: "/subdir", size: 0, isDirectory: true },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() => {
      expect(screen.getByText("subdir")).toBeInTheDocument();
    });
  });

  // ── Navigation ────────────────────────────────────────────────────────

  it("navigates into a directory when clicked", async () => {
    (window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { name: "jobs", path: "/jobs", size: 0, isDirectory: true },
      ])
      .mockResolvedValueOnce([
        {
          name: "file1.gcode",
          path: "/jobs/file1.gcode",
          size: 100,
          isDirectory: false,
        },
      ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() => {
      expect(screen.getByText("jobs")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("jobs"));
    await waitFor(() => {
      expect(screen.getByText("file1.gcode")).toBeInTheDocument();
    });
  });

  // ── File selection (job file) ─────────────────────────────────────────

  it("selects a file as job file when clicked", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "art.gcode", path: "/art.gcode", size: 1000, isDirectory: false },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() => {
      expect(screen.getByText("art.gcode")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("art.gcode"));
    const selected = useMachineStore.getState().selectedJobFile;
    expect(selected).not.toBeNull();
    expect(selected!.name).toBe("art.gcode");
  });

  // ── Delete ────────────────────────────────────────────────────────────

  it("shows delete button on hover for files", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "old.gcode", path: "/old.gcode", size: 100, isDirectory: false },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() => {
      expect(screen.getByText("old.gcode")).toBeInTheDocument();
    });
    // The delete button should be available in the row
    const delBtns = screen.getAllByTitle("Delete");
    expect(delBtns.length).toBeGreaterThanOrEqual(1);
  });

  // ── Upload trigger ────────────────────────────────────────────────────

  it("opens file dialog when upload button clicked", async () => {
    useMachineStore.setState({ connected: true });
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fs.openFileDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    render(<FileBrowserPanel />);
    await waitFor(() => {
      const btns = screen.getAllByText(/Upload to \//);
      expect(btns[0]).not.toBeDisabled();
    });
    const btns = screen.getAllByText(/Upload to \//);
    await userEvent.click(btns[0]);
    expect(window.terraForge.fs.openFileDialog).toHaveBeenCalled();
  });

  // ── Download trigger ──────────────────────────────────────────────────

  it("shows download button for files", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "job.gcode", path: "/job.gcode", size: 100, isDirectory: false },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() => {
      expect(screen.getByText("job.gcode")).toBeInTheDocument();
    });
    const dlBtns = screen.getAllByTitle("Download");
    expect(dlBtns.length).toBeGreaterThanOrEqual(1);
  });

  // ── Error display ─────────────────────────────────────────────────────

  it("shows error message when file listing fails", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("SD card: READER FAILED"));
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() => {
      expect(screen.getByText(/READER FAILED/)).toBeInTheDocument();
    });
  });

  // ── Empty state ───────────────────────────────────────────────────────

  it("shows 'Empty.' when connected but no files", async () => {
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() => {
      const empties = screen.getAllByText("Empty.");
      expect(empties.length).toBeGreaterThanOrEqual(1);
    });
  });
});
