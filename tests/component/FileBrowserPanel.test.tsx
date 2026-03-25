import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
    gcodeSource: null,
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

  // ── Preview confirmation guard ──────────────────────────────────────

  it("shows confirm dialog and loads preview when toolpath already exists and user confirms", async () => {
    const existingTp = {
      cuts: "M0 0",
      rapids: "",
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      lineCount: 1,
    };
    useCanvasStore.setState({ gcodeToolpath: existingTp as any });
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "new.gcode", path: "/new.gcode", size: 200, isDirectory: false },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fluidnc.fetchFileText as ReturnType<typeof vi.fn>
    ).mockResolvedValue("G0 X10 Y10\nG1 X20 Y20 F1000\n");
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("new.gcode")).toBeInTheDocument(),
    );
    const previewBtns = screen.getAllByTitle("Preview toolpath");
    await userEvent.click(previewBtns[0]);
    // Styled confirm dialog should appear
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByText(/Replace Toolpath/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => {
      expect(useCanvasStore.getState().gcodeToolpath).not.toBeNull();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not replace toolpath when toolpath already exists and user cancels confirm", async () => {
    const existingTp = {
      cuts: "M0 0",
      rapids: "",
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      lineCount: 1,
    };
    useCanvasStore.setState({ gcodeToolpath: existingTp as any });
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "new.gcode", path: "/new.gcode", size: 200, isDirectory: false },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("new.gcode")).toBeInTheDocument(),
    );
    const previewBtns = screen.getAllByTitle("Preview toolpath");
    await userEvent.click(previewBtns[0]);
    // Styled confirm dialog should appear
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.terraForge.fluidnc.fetchFileText).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().gcodeToolpath).toEqual(existingTp);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("loads preview without confirm dialog when no toolpath is currently loaded", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        name: "first.gcode",
        path: "/first.gcode",
        size: 200,
        isDirectory: false,
      },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fluidnc.fetchFileText as ReturnType<typeof vi.fn>
    ).mockResolvedValue("G0 X10 Y10\nG1 X20 Y20 F1000\n");
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("first.gcode")).toBeInTheDocument(),
    );
    const previewBtns = screen.getAllByTitle("Preview toolpath");
    await userEvent.click(previewBtns[0]);
    await waitFor(() =>
      expect(useCanvasStore.getState().gcodeToolpath).not.toBeNull(),
    );
    // No dialog should have appeared
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Preview should also select the file as the queued job
    const jobFile = useMachineStore.getState().selectedJobFile;
    expect(jobFile).not.toBeNull();
    expect(jobFile!.name).toBe("first.gcode");
    expect(jobFile!.path).toBe("/first.gcode");
    expect(jobFile!.source).toBe("sd");
  });

  it("sets selectedJobFile when a remote file is previewed (enables Start Job)", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "job.gcode", path: "/job.gcode", size: 512, isDirectory: false },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fluidnc.fetchFileText as ReturnType<typeof vi.fn>
    ).mockResolvedValue("G1 X50 Y50 F2000\n");
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("job.gcode")).toBeInTheDocument(),
    );
    expect(useMachineStore.getState().selectedJobFile).toBeNull();
    const previewBtns = screen.getAllByTitle("Preview toolpath");
    await userEvent.click(previewBtns[0]);
    await waitFor(() => {
      const jf = useMachineStore.getState().selectedJobFile;
      expect(jf).not.toBeNull();
      expect(jf!.name).toBe("job.gcode");
    });
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

  // ── No SD card error ──────────────────────────────────────────────────

  it("shows 'No SD card.' message for no-sd-card errors", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("SD card: no sd card inserted"));
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() => {
      expect(screen.getByText("No SD card.")).toBeInTheDocument();
    });
  });

  // ── Run a job file ────────────────────────────────────────────────────

  it("clicking Run button on an SD file calls runFile", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "job.gcode", path: "/job.gcode", size: 100, isDirectory: false },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fluidnc.fetchFileText as ReturnType<typeof vi.fn>
    ).mockResolvedValue("G0 X0 Y0\nG1 X10 Y10 F1000\n");
    (
      window.terraForge.fluidnc.runFile as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("job.gcode")).toBeInTheDocument(),
    );
    // Hover over the row to reveal action buttons
    const row = screen.getByTestId("file-row-job.gcode");
    await userEvent.hover(row);
    const runBtn = screen.getByTitle("Run job now");
    await userEvent.click(runBtn);
    // runFile is called after the preview loads (with a 1s delay — skip by confirming state)
    await waitFor(
      () => {
        expect(window.terraForge.fluidnc.runFile).toHaveBeenCalledWith(
          "/job.gcode",
          "sd",
        );
      },
      { timeout: 3000 },
    );
  });

  // ── Run confirmation when a different toolpath is loaded ──────────────

  it("shows confirm dialog when running a file while a different toolpath is active", async () => {
    const existingTp = {
      cuts: "M0 0",
      rapids: "",
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      lineCount: 1,
    };
    useCanvasStore.setState({
      gcodeToolpath: existingTp as any,
      gcodeSource: { path: "/other.gcode", name: "other.gcode", source: "sd" },
    });
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        name: "new.gcode",
        path: "/new.gcode",
        size: 100,
        isDirectory: false,
      },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("new.gcode")).toBeInTheDocument(),
    );
    const row = screen.getByTestId("file-row-new.gcode");
    await userEvent.hover(row);
    const runBtn = screen.getByTitle("Run job now");
    await userEvent.click(runBtn);
    // The "Replace Toolpath & Run?" confirm should appear
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByText(/Replace Toolpath & Run/i)).toBeInTheDocument();
    // Cancel the run
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.terraForge.fluidnc.runFile).not.toHaveBeenCalled();
  });

  // ── Breadcrumb navigation (navigating to subdirectory then back) ──────

  it("clicking '..' row navigates to parent directory", async () => {
    (window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { name: "docs", path: "/docs", size: 0, isDirectory: true },
      ])
      .mockResolvedValueOnce([
        {
          name: "readme.txt",
          path: "/docs/readme.txt",
          size: 50,
          isDirectory: false,
        },
      ])
      .mockResolvedValueOnce([
        { name: "docs", path: "/docs", size: 0, isDirectory: true },
      ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    // Navigate into /docs
    await waitFor(() => expect(screen.getByText("docs")).toBeInTheDocument());
    await userEvent.click(screen.getByText("docs"));
    await waitFor(() =>
      expect(screen.getByText("readme.txt")).toBeInTheDocument(),
    );
    // Click ".." to go up
    await userEvent.click(screen.getByText(".."));
    await waitFor(() => expect(screen.getByText("docs")).toBeInTheDocument());
    expect(screen.queryByText("readme.txt")).not.toBeInTheDocument();
  });

  // ── Delete confirmation ───────────────────────────────────────────────

  it("clicking delete button shows confirm dialog and deletes on confirm", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "old.gcode", path: "/old.gcode", size: 100, isDirectory: false },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fluidnc.deleteFile as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("old.gcode")).toBeInTheDocument(),
    );
    const delBtns = screen.getAllByTitle("Delete");
    await userEvent.click(delBtns[0]);
    // Confirm dialog appears
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByText(/Delete File/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(window.terraForge.fluidnc.deleteFile).toHaveBeenCalledWith(
        "/old.gcode",
        "sd",
      );
    });
  });

  it("clicking Cancel on delete dialog does not delete the file", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        name: "keep.gcode",
        path: "/keep.gcode",
        size: 100,
        isDirectory: false,
      },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("keep.gcode")).toBeInTheDocument(),
    );
    const delBtns = screen.getAllByTitle("Delete");
    await userEvent.click(delBtns[0]);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.terraForge.fluidnc.deleteFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // ── Both panes open → drag divider visible ────────────────────────────

  it("drag divider appears when both internal and SD panes are open", async () => {
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    // SD is open by default; open internal too
    await userEvent.click(screen.getByText(/internal/i));
    // Drag divider should now be visible
    await waitFor(() => {
      expect(screen.getByTitle("Drag to resize")).toBeInTheDocument();
    });
  });

  // ── Upload triggers file dialog ───────────────────────────────────────

  it("upload enqueues an upload task and triggers file listing refresh", async () => {
    useMachineStore.setState({ connected: true });
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fs.openFileDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue("/local/drawing.gcode");
    (
      window.terraForge.fluidnc.uploadFile as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    render(<FileBrowserPanel />);
    await waitFor(() => {
      const btns = screen.getAllByText(/Upload to \//);
      expect(btns[0]).not.toBeDisabled();
    });
    const btns = screen.getAllByText(/Upload to \//);
    await userEvent.click(btns[0]);
    expect(window.terraForge.fluidnc.uploadFile).toHaveBeenCalled();
  });

  // ── Deselecting a selected file row ───────────────────────────────────

  it("clicking the selected file row again deselects it", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "art.gcode", path: "/art.gcode", size: 200, isDirectory: false },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("art.gcode")).toBeInTheDocument(),
    );
    // Select
    await userEvent.click(screen.getByText("art.gcode"));
    expect(useMachineStore.getState().selectedJobFile).not.toBeNull();
    // Deselect
    await userEvent.click(screen.getByText("art.gcode"));
    expect(useMachineStore.getState().selectedJobFile).toBeNull();
  });

  // ── Download button ──────────────────────────────────────────────────

  it("download button calls saveGcodeDialog then downloadFile for .gcode files", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        name: "output.gcode",
        path: "/output.gcode",
        size: 512,
        isDirectory: false,
      },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fs.saveGcodeDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue("/local/output.gcode");
    (
      window.terraForge.fluidnc.downloadFile as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("output.gcode")).toBeInTheDocument(),
    );
    const row = screen.getByTestId("file-row-output.gcode");
    await userEvent.hover(row);
    const dlBtn = screen.getByTitle("Download");
    await userEvent.click(dlBtn);
    await waitFor(() => {
      expect(window.terraForge.fs.saveGcodeDialog).toHaveBeenCalledWith(
        "output.gcode",
      );
      expect(window.terraForge.fluidnc.downloadFile).toHaveBeenCalled();
    });
  });

  it("download button cancelled when saveGcodeDialog returns null", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "out.gcode", path: "/out.gcode", size: 100, isDirectory: false },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fs.saveGcodeDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("out.gcode")).toBeInTheDocument(),
    );
    const row = screen.getByTestId("file-row-out.gcode");
    await userEvent.hover(row);
    await userEvent.click(screen.getByTitle("Download"));
    await waitFor(() => {
      expect(window.terraForge.fs.saveGcodeDialog).toHaveBeenCalled();
    });
    expect(window.terraForge.fluidnc.downloadFile).not.toHaveBeenCalled();
  });

  // ── Pause / Resume buttons while job running ────────────────────────

  it("shows Pause button when the active job file is running (Run state)", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        name: "run.gcode",
        path: "/run.gcode",
        size: 100,
        isDirectory: false,
      },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({
      connected: true,
      selectedJobFile: { path: "/run.gcode", source: "sd", name: "run.gcode" },
      status: {
        state: "Run" as any,
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Run|MPos:0,0,0>",
        activeJobPath: "/run.gcode",
      } as any,
    });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("run.gcode")).toBeInTheDocument(),
    );
    expect(screen.getByTitle("Pause job")).toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Pause job"));
    expect(window.terraForge.fluidnc.pauseJob).toHaveBeenCalled();
  });

  it("shows Resume button when the active job file is in Hold state", async () => {
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        name: "held.gcode",
        path: "/held.gcode",
        size: 100,
        isDirectory: false,
      },
    ]);
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({
      connected: true,
      selectedJobFile: {
        path: "/held.gcode",
        source: "sd",
        name: "held.gcode",
      },
      status: {
        state: "Hold" as any,
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
        raw: "<Hold|MPos:0,0,0>",
        activeJobPath: "/held.gcode",
      } as any,
    });
    render(<FileBrowserPanel />);
    await waitFor(() =>
      expect(screen.getByText("held.gcode")).toBeInTheDocument(),
    );
    expect(screen.getByTitle("Resume job")).toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Resume job"));
    expect(window.terraForge.fluidnc.resumeJob).toHaveBeenCalled();
  });

  // ── Drag-to-resize divider ──────────────────────────────────────────

  it("dragging the resize divider calls onMouseMove and onMouseUp handlers", async () => {
    (
      window.terraForge.fluidnc.listFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      window.terraForge.fluidnc.listSDFiles as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    useMachineStore.setState({ connected: true });
    render(<FileBrowserPanel />);
    // Open the internal pane so both are open and the drag handle appears
    await userEvent.click(screen.getByText(/internal/i));
    const divider = await screen.findByTitle("Drag to resize");
    // Start drag at y=100
    fireEvent.mouseDown(divider, { clientY: 100 });
    // Move mouse down by 50px — should call setSplitPx
    fireEvent.mouseMove(document, { clientY: 150 });
    // Release mouse
    fireEvent.mouseUp(document);
    // Moving after release should be a no-op (dragRef cleared)
    fireEvent.mouseMove(document, { clientY: 200 });
    // The test just verifies no error thrown and the component is still rendered
    expect(screen.getByTitle("Drag to resize")).toBeInTheDocument();
  });
});
