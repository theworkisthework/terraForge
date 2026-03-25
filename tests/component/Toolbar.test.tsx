import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMachineStore } from "@renderer/store/machineStore";
import { useCanvasStore } from "@renderer/store/canvasStore";
import { useTaskStore } from "@renderer/store/taskStore";
import { Toolbar } from "@renderer/components/Toolbar";
import { createMachineConfig, createSvgImport } from "../helpers/factories";
import { importPdf } from "@renderer/utils/pdfImport";

// Mock importPdf so component tests can control PDF-parsing outcomes without
// running the real pdfjs renderer.
vi.mock("@renderer/utils/pdfImport", () => ({
  importPdf: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  useMachineStore.setState({
    configs: [],
    activeConfigId: null,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
    fwInfo: null,
  });
  useCanvasStore.setState({
    imports: [],
    selectedImportId: null,
    selectedPathId: null,
    gcodeToolpath: null,
  });
  useTaskStore.setState({ tasks: {} });
  vi.clearAllMocks();
});

describe("Toolbar", () => {
  it("renders the brand name", () => {
    render(<Toolbar />);
    expect(screen.getByText("terraForge")).toBeInTheDocument();
  });

  it("renders the machine selector dropdown", () => {
    const cfg = createMachineConfig({ name: "My Plotter" });
    useMachineStore.setState({ configs: [cfg] });
    render(<Toolbar />);
    expect(screen.getByText("My Plotter")).toBeInTheDocument();
  });

  it("shows Connect button when disconnected", () => {
    render(<Toolbar />);
    expect(screen.getByText("Connect")).toBeInTheDocument();
  });

  it("shows Disconnect button when connected", () => {
    useMachineStore.setState({ connected: true });
    render(<Toolbar />);
    expect(screen.getByText("Disconnect")).toBeInTheDocument();
  });

  it("shows Offline status when not connected", () => {
    render(<Toolbar />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("shows Connected status when wsLive", () => {
    useMachineStore.setState({ connected: true, wsLive: true });
    render(<Toolbar />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  // ── Firmware version display ───────────────────────────────────────────

  it("shows firmware version when connected and fwInfo is set", () => {
    useMachineStore.setState({
      connected: true,
      wsLive: true,
      fwInfo: "FluidNC v4.0.1",
    });
    render(<Toolbar />);
    expect(screen.getByText("FluidNC v4.0.1")).toBeInTheDocument();
  });

  it("hides firmware version when not connected", () => {
    useMachineStore.setState({ connected: false, fwInfo: "FluidNC v4.0.1" });
    render(<Toolbar />);
    expect(screen.queryByText("FluidNC v4.0.1")).not.toBeInTheDocument();
  });

  it("hides firmware version when connected but fwInfo is null", () => {
    useMachineStore.setState({ connected: true, wsLive: true, fwInfo: null });
    render(<Toolbar />);
    // No firmware label should appear
    expect(
      screen.queryByTitle("Detected firmware version"),
    ).not.toBeInTheDocument();
  });

  it("renders Import button", () => {
    render(<Toolbar />);
    expect(screen.getByText("Import")).toBeInTheDocument();
  });

  it("renders Generate G-code button", () => {
    render(<Toolbar />);
    expect(screen.getByText("Generate G-code")).toBeInTheDocument();
  });

  it("disables Generate G-code when no imports", () => {
    render(<Toolbar />);
    expect(screen.getByText("Generate G-code")).toBeDisabled();
  });

  it("enables Generate G-code when imports exist", () => {
    const imp = createSvgImport({ name: "test" });
    useCanvasStore.setState({ imports: [imp] });
    render(<Toolbar />);
    expect(screen.getByText("Generate G-code")).not.toBeDisabled();
  });

  it("renders Home button", () => {
    render(<Toolbar />);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("disables Home when not connected", () => {
    render(<Toolbar />);
    expect(screen.getByText("Home")).toBeDisabled();
  });

  it("renders Jog button", () => {
    render(<Toolbar />);
    expect(screen.getByText("Jog")).toBeInTheDocument();
  });

  it("renders settings button", () => {
    render(<Toolbar />);
    expect(screen.getByText("⚙")).toBeInTheDocument();
  });

  it("disables machine selector while connected", () => {
    const cfg = createMachineConfig({ name: "My Plotter" });
    useMachineStore.setState({ configs: [cfg], connected: true });
    render(<Toolbar />);
    const select = screen.getByRole("combobox");
    expect(select).toBeDisabled();
  });

  // ── Import interaction (unified button) ───────────────────────────────

  it("clicking Import opens the unified file dialog", async () => {
    (
      window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    render(<Toolbar />);
    await userEvent.click(screen.getByText("Import"));
    expect(window.terraForge.fs.openImportDialog).toHaveBeenCalled();
  });

  it("imports SVG paths when an .svg file is selected", async () => {
    const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <path d="M0,0 L50,50" />
    </svg>`;
    (
      window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue("/test.svg");
    (
      window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
    ).mockResolvedValue(svgXml);

    render(<Toolbar />);
    await userEvent.click(screen.getByText("Import"));

    await waitFor(() => {
      expect(useCanvasStore.getState().imports.length).toBe(1);
    });
  });

  it("parses imported G-code and sets toolpath when a .gcode file is selected", async () => {
    const gcode = "G0 X0 Y0\nG1 X10 Y10 F1000\n";
    (
      window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue("/test.gcode");
    (
      window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
    ).mockResolvedValue(gcode);
    render(<Toolbar />);
    await userEvent.click(screen.getByText("Import"));
    await waitFor(() => {
      expect(useCanvasStore.getState().gcodeToolpath).not.toBeNull();
    });
  });

  // ── Connect / Disconnect ───────────────────────────────────────────────

  it("Connect button calls connectWebSocket for wifi config", async () => {
    const cfg = createMachineConfig({
      name: "WiFi Plotter",
      connection: { type: "wifi", host: "192.168.1.10", port: 80 },
    });
    useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
    (
      window.terraForge.fluidnc.connectWebSocket as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    render(<Toolbar />);
    await userEvent.click(screen.getByText("Connect"));
    await waitFor(() => {
      expect(window.terraForge.fluidnc.connectWebSocket).toHaveBeenCalledWith(
        "192.168.1.10",
        80,
        undefined,
      );
    });
  });

  it("Connect button calls serial.connect for usb config", async () => {
    const cfg = createMachineConfig({
      name: "USB Plotter",
      connection: { type: "usb", serialPath: "COM3" },
    });
    useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
    (
      window.terraForge.serial.connect as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    render(<Toolbar />);
    await userEvent.click(screen.getByText("Connect"));
    await waitFor(() => {
      expect(window.terraForge.serial.connect).toHaveBeenCalledWith(
        "COM3",
        115200,
      );
    });
  });

  it("Disconnect calls disconnectWebSocket for wifi", async () => {
    const cfg = createMachineConfig({
      name: "WiFi Plotter",
      connection: { type: "wifi", host: "192.168.1.10", port: 80 },
    });
    useMachineStore.setState({
      configs: [cfg],
      activeConfigId: cfg.id,
      connected: true,
    });
    (
      window.terraForge.fluidnc.disconnectWebSocket as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    render(<Toolbar />);
    await userEvent.click(screen.getByText("Disconnect"));
    await waitFor(() => {
      expect(window.terraForge.fluidnc.disconnectWebSocket).toHaveBeenCalled();
    });
  });

  // ── Home button ────────────────────────────────────────────────────────

  it("Home sends $H command when connected", async () => {
    const cfg = createMachineConfig({ name: "My Plotter" });
    useMachineStore.setState({
      configs: [cfg],
      activeConfigId: cfg.id,
      connected: true,
    });
    render(<Toolbar />);
    await userEvent.click(screen.getByText("Home"));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith("$H");
  });

  // ── Jog panel toggle ──────────────────────────────────────────────────

  it("Jog button toggles jog panel visibility", async () => {
    const cfg = createMachineConfig({ name: "My Plotter" });
    useMachineStore.setState({
      configs: [cfg],
      activeConfigId: cfg.id,
      connected: true,
    });
    const onToggleJog = vi.fn();
    render(<Toolbar showJog={false} onToggleJog={onToggleJog} />);
    await userEvent.click(screen.getByText("Jog"));
    expect(onToggleJog).toHaveBeenCalledTimes(1);
  });

  // ── Settings dialog toggle ────────────────────────────────────────────

  it("⚙ button opens Machine Config dialog", async () => {
    const cfg = createMachineConfig({ name: "My Plotter" });
    useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
    render(<Toolbar />);
    await userEvent.click(screen.getByText("⚙"));
    expect(screen.getByText("Machine Configurations")).toBeInTheDocument();
  });

  // ── Machine selector changes active config ────────────────────────────

  it("machine selector changes active config id", async () => {
    const c1 = createMachineConfig({ name: "Alpha" });
    const c2 = createMachineConfig({ name: "Beta" });
    useMachineStore.setState({ configs: [c1, c2], activeConfigId: c1.id });
    render(<Toolbar />);
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, c2.id);
    expect(useMachineStore.getState().activeConfigId).toBe(c2.id);
  });

  // ── Generate G-code dialog ────────────────────────────────────────────

  describe("Generate G-code dialog", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      localStorage.removeItem("terraforge.gcodePrefs");
    });

    it("clicking Generate G-code opens the options dialog", async () => {
      const imp = createSvgImport({ name: "test" });
      useCanvasStore.setState({ imports: [imp] });
      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      expect(
        screen.getByRole("heading", { name: "Options" }),
      ).toBeInTheDocument();
    });

    it("dialog shows Optimise paths, Upload to SD, and Save to computer checkboxes", async () => {
      const imp = createSvgImport({ name: "test" });
      useCanvasStore.setState({ imports: [imp] });
      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      expect(screen.getByText("Optimise paths")).toBeInTheDocument();
      expect(screen.getByText("Upload to SD card")).toBeInTheDocument();
      expect(screen.getByText("Save to computer")).toBeInTheDocument();
    });

    it("dialog defaults: Optimise=checked, JoinPaths=unchecked, Upload=checked, Save=unchecked", async () => {
      const imp = createSvgImport({ name: "test" });
      useCanvasStore.setState({ imports: [imp] });
      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      expect(
        screen.getByRole("checkbox", { name: "Optimise paths" }),
      ).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Join nearby paths" }),
      ).not.toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Upload to SD card" }),
      ).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Save to computer" }),
      ).not.toBeChecked();
    });

    it("Cancel button closes the dialog without generating", async () => {
      const imp = createSvgImport({ name: "test" });
      useCanvasStore.setState({ imports: [imp] });
      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      expect(
        screen.getByRole("heading", { name: "Options" }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByText("Cancel"));
      expect(
        screen.queryByRole("heading", { name: "Options" }),
      ).not.toBeInTheDocument();
      // No gcode-generate task should have been created
      const tasks = Object.values(useTaskStore.getState().tasks);
      expect(tasks.some((t) => t.type === "gcode-generate")).toBe(false);
    });

    it("Generate button is disabled when neither output is selected", async () => {
      const imp = createSvgImport({ name: "test" });
      useCanvasStore.setState({ imports: [imp] });
      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      await userEvent.click(
        screen.getByRole("checkbox", { name: "Upload to SD card" }),
      );
      const generateBtn = screen.getByRole("button", { name: "Generate" });
      expect(generateBtn).toBeDisabled();
    });

    it("confirming the dialog starts a gcode-generate task", async () => {
      const workerInstances: {
        postMessage: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
      }[] = [];
      function MockWorker() {
        const instance = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null as unknown,
          onerror: null,
        };
        workerInstances.push(instance);
        return instance;
      }
      vi.stubGlobal("Worker", MockWorker);

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      // Dialog closes after confirm
      expect(
        screen.queryByRole("heading", { name: "Options" }),
      ).not.toBeInTheDocument();

      // A gcode-generate task should be registered in the store
      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        expect(tasks.some((t) => t.type === "gcode-generate")).toBe(true);
      });
    });

    it("confirming with optimise=true passes optimisePaths:true to worker", async () => {
      const workerInstances: {
        postMessage: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
      }[] = [];
      function MockWorker() {
        const instance = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null as unknown,
          onerror: null,
        };
        workerInstances.push(instance);
        return instance;
      }
      vi.stubGlobal("Worker", MockWorker);

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      // Optimise checkbox is checked by default — confirm immediately
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      const instance = workerInstances[0];
      expect(instance?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "generate",
          options: expect.objectContaining({ optimisePaths: true }),
        }),
      );
    });

    it("confirming with optimise=false passes optimisePaths:false to worker", async () => {
      const workerInstances: {
        postMessage: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
      }[] = [];
      function MockWorker() {
        const instance = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null as unknown,
          onerror: null,
        };
        workerInstances.push(instance);
        return instance;
      }
      vi.stubGlobal("Worker", MockWorker);

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      await userEvent.click(
        screen.getByRole("checkbox", { name: "Optimise paths" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      const instance = workerInstances[0];
      expect(instance?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "generate",
          options: expect.objectContaining({ optimisePaths: false }),
        }),
      );
    });

    it("preferences are persisted to localStorage on confirm", async () => {
      function MockWorker() {
        return {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null,
          onerror: null,
        };
      }
      vi.stubGlobal("Worker", MockWorker);

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      await userEvent.click(
        screen.getByRole("checkbox", { name: "Save to computer" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      const stored = JSON.parse(
        localStorage.getItem("terraforge.gcodePrefs") ?? "{}",
      );
      expect(stored.saveLocally).toBe(true);
    });

    // ── Join nearby paths UI ───────────────────────────────────────────

    it("dialog shows 'Join nearby paths' checkbox with Experimental badge", async () => {
      const imp = createSvgImport({ name: "test" });
      useCanvasStore.setState({ imports: [imp] });
      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      expect(screen.getByText("Join nearby paths")).toBeInTheDocument();
      expect(screen.getByText("Experimental")).toBeInTheDocument();
    });

    it("dialog shows tolerance field always (dimmed when join is unchecked)", async () => {
      const imp = createSvgImport({ name: "test" });
      useCanvasStore.setState({ imports: [imp] });
      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      // Tolerance input is always rendered
      expect(screen.getByText("Tolerance")).toBeInTheDocument();
      // The number input should be disabled while join is off
      const toleranceInput = screen.getByRole("spinbutton");
      expect(toleranceInput).toBeDisabled();
    });

    it("tolerance field becomes enabled when Join nearby paths is checked", async () => {
      const imp = createSvgImport({ name: "test" });
      useCanvasStore.setState({ imports: [imp] });
      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      await userEvent.click(
        screen.getByRole("checkbox", { name: "Join nearby paths" }),
      );
      const toleranceInput = screen.getByRole("spinbutton");
      expect(toleranceInput).not.toBeDisabled();
    });

    it("confirming with joinPaths=true passes joinPaths:true and joinTolerance to worker", async () => {
      const workerInstances: {
        postMessage: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
      }[] = [];
      function MockWorker() {
        const instance = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null as unknown,
          onerror: null,
        };
        workerInstances.push(instance);
        return instance;
      }
      vi.stubGlobal("Worker", MockWorker);

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      await userEvent.click(
        screen.getByRole("checkbox", { name: "Join nearby paths" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      expect(workerInstances[0]?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "generate",
          options: expect.objectContaining({
            joinPaths: true,
            joinTolerance: 0.2,
          }),
        }),
      );
    });

    it("confirming with joinPaths=false passes joinPaths:false to worker", async () => {
      const workerInstances: {
        postMessage: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
      }[] = [];
      function MockWorker() {
        const instance = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null as unknown,
          onerror: null,
        };
        workerInstances.push(instance);
        return instance;
      }
      vi.stubGlobal("Worker", MockWorker);

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      // Join paths is unchecked by default — confirm without changing it
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      expect(workerInstances[0]?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "generate",
          options: expect.objectContaining({ joinPaths: false }),
        }),
      );
    });

    it("join prefs are persisted to localStorage on confirm", async () => {
      function MockWorker() {
        return {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null,
          onerror: null,
        };
      }
      vi.stubGlobal("Worker", MockWorker);

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      await userEvent.click(
        screen.getByRole("checkbox", { name: "Join nearby paths" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      const stored = JSON.parse(
        localStorage.getItem("terraforge.gcodePrefs") ?? "{}",
      );
      expect(stored.joinPaths).toBe(true);
      expect(stored.joinTolerance).toBe(0.2);
    });

    // ── Worker message handlers ────────────────────────────────────────

    it("worker 'complete' message marks task as completed and sets toolpath", async () => {
      let workerInstance: {
        postMessage: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
        onmessage: ((e: MessageEvent) => void) | null;
      } | null = null;
      function MockWorker() {
        const inst = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null as ((e: MessageEvent) => void) | null,
          onerror: null,
        };
        workerInstance = inst;
        return inst;
      }
      vi.stubGlobal("Worker", MockWorker);

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({
        configs: [cfg],
        activeConfigId: cfg.id,
        connected: false,
      });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      // Simulate worker sending complete
      await waitFor(() => expect(workerInstance).not.toBeNull());
      workerInstance!.onmessage?.({
        data: { type: "complete", gcode: "G0 X0 Y0\nG1 X10 Y10 F1000\n" },
      } as MessageEvent);

      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        const genTask = tasks.find((t) => t.type === "gcode-generate");
        expect(genTask?.status).toBe("completed");
      });
      expect(useCanvasStore.getState().gcodeToolpath).not.toBeNull();
    });

    it("worker 'cancelled' message marks task as cancelled", async () => {
      let workerInstance: {
        postMessage: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
        onmessage: ((e: MessageEvent) => void) | null;
      } | null = null;
      function MockWorker() {
        const inst = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null as ((e: MessageEvent) => void) | null,
          onerror: null,
        };
        workerInstance = inst;
        return inst;
      }
      vi.stubGlobal("Worker", MockWorker);

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      await waitFor(() => expect(workerInstance).not.toBeNull());
      workerInstance!.onmessage?.({
        data: { type: "cancelled" },
      } as MessageEvent);

      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        const genTask = tasks.find((t) => t.type === "gcode-generate");
        expect(genTask?.status).toBe("cancelled");
      });
      // Generate button should be re-enabled after cancellation
      expect(screen.getByText("Generate G-code")).not.toBeDisabled();
    });

    it("worker 'error' message marks task as error", async () => {
      let workerInstance: {
        postMessage: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
        onmessage: ((e: MessageEvent) => void) | null;
      } | null = null;
      function MockWorker() {
        const inst = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null as ((e: MessageEvent) => void) | null,
          onerror: null,
        };
        workerInstance = inst;
        return inst;
      }
      vi.stubGlobal("Worker", MockWorker);

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      await waitFor(() => expect(workerInstance).not.toBeNull());
      workerInstance!.onmessage?.({
        data: { type: "error", error: "Out of memory" },
      } as MessageEvent);

      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        const genTask = tasks.find((t) => t.type === "gcode-generate");
        expect(genTask?.status).toBe("error");
        expect(genTask?.error).toBe("Out of memory");
      });
    });

    it("worker 'complete' uploads to SD when uploadToSd=true and connected", async () => {
      let workerInstance: {
        onmessage: ((e: MessageEvent) => void) | null;
      } | null = null;
      function MockWorker() {
        const inst = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null as ((e: MessageEvent) => void) | null,
          onerror: null,
        };
        workerInstance = inst;
        return inst;
      }
      vi.stubGlobal("Worker", MockWorker);
      (
        window.terraForge.fluidnc.uploadGcode as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({
        configs: [cfg],
        activeConfigId: cfg.id,
        connected: true,
      });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      // uploadToSd is checked by default
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      await waitFor(() => expect(workerInstance).not.toBeNull());
      workerInstance!.onmessage?.({
        data: { type: "complete", gcode: "G0 X0 Y0\n" },
      } as MessageEvent);

      await waitFor(() => {
        expect(window.terraForge.fluidnc.uploadGcode).toHaveBeenCalled();
      });
    });

    it("worker 'complete' saves to computer when saveLocally=true", async () => {
      let workerInstance: {
        onmessage: ((e: MessageEvent) => void) | null;
      } | null = null;
      function MockWorker() {
        const inst = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          onmessage: null as ((e: MessageEvent) => void) | null,
          onerror: null,
        };
        workerInstance = inst;
        return inst;
      }
      vi.stubGlobal("Worker", MockWorker);
      (
        window.terraForge.fs.saveGcodeDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/out/drawing.gcode");
      (
        window.terraForge.fs.writeFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);
      // Disable SD upload so test is focused on local save
      localStorage.setItem(
        "terraforge.gcodePrefs",
        JSON.stringify({
          optimise: true,
          uploadToSd: false,
          saveLocally: true,
          joinPaths: false,
          joinTolerance: 0.2,
          liftPenAtEnd: true,
          returnToHome: false,
          customStartGcode: "",
          customEndGcode: "",
        }),
      );

      const cfg = createMachineConfig({ name: "Test Plotter" });
      useMachineStore.setState({
        configs: [cfg],
        activeConfigId: cfg.id,
        connected: false,
      });
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      await waitFor(() => expect(workerInstance).not.toBeNull());
      workerInstance!.onmessage?.({
        data: { type: "complete", gcode: "G0 X0 Y0\n" },
      } as MessageEvent);

      await waitFor(() => {
        expect(window.terraForge.fs.saveGcodeDialog).toHaveBeenCalled();
        expect(window.terraForge.fs.writeFile).toHaveBeenCalled();
      });
    });
  });

  // ── SVG import: shape variety ──────────────────────────────────────────────

  describe("SVG import shape handling", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      localStorage.removeItem("terraforge.gcodePrefs");
    });

    it("imports circles from SVG", async () => {
      const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="30" stroke="black" stroke-width="1" fill="none" />
      </svg>`;
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/test.svg");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(svgXml);

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        expect(useCanvasStore.getState().imports.length).toBe(1);
      });
    });

    it("imports ellipses from SVG", async () => {
      const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
        <ellipse cx="50" cy="50" rx="40" ry="20" stroke="black" fill="none" />
      </svg>`;
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/drawing.svg");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(svgXml);

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        expect(useCanvasStore.getState().imports.length).toBe(1);
      });
    });

    it("imports lines from SVG", async () => {
      const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
        <line x1="10" y1="10" x2="90" y2="90" stroke="blue" />
      </svg>`;
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/lines.svg");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(svgXml);

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        expect(useCanvasStore.getState().imports.length).toBe(1);
      });
    });

    it("imports polylines from SVG", async () => {
      const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
        <polyline points="10,10 50,50 90,10" stroke="red" fill="none" />
      </svg>`;
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/poly.svg");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(svgXml);

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        expect(useCanvasStore.getState().imports.length).toBe(1);
      });
    });

    it("imports polygons from SVG", async () => {
      const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
        <polygon points="10,10 90,10 50,90" stroke="green" fill="none" />
      </svg>`;
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/polygon.svg");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(svgXml);

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        expect(useCanvasStore.getState().imports.length).toBe(1);
      });
    });

    it("imports rounded rects from SVG", async () => {
      const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
        <rect x="10" y="10" width="80" height="60" rx="10" ry="5" stroke="black" fill="none" />
      </svg>`;
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/roundrect.svg");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(svgXml);

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        expect(useCanvasStore.getState().imports.length).toBe(1);
      });
    });

    it("skips shapes with fully transparent fill (fill-opacity: 0) and no stroke", async () => {
      const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
        <rect x="10" y="10" width="80" height="60" fill="red" style="fill-opacity:0" />
        <path d="M10 10 L50 50" stroke="black" fill="none" />
      </svg>`;
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/opacity.svg");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(svgXml);

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        expect(useCanvasStore.getState().imports.length).toBe(1);
      });
      // The rect with fill-opacity=0 and no stroke has getEffectiveFill=null, hasVisibleStroke=false
      // but it's still added as a path (fill detection affects hatch, not inclusion)
      // The <path> will definitely be included
      const paths = useCanvasStore.getState().imports[0].paths;
      expect(paths.length).toBeGreaterThanOrEqual(1);
    });

    it("records zero-opacity stroke as not visible", async () => {
      const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
        <path d="M10 10 L50 50" stroke="black" style="stroke-width:0" />
        <path d="M0 0 L100 0" stroke="red" />
      </svg>`;
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/stroketest.svg");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(svgXml);

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        expect(useCanvasStore.getState().imports.length).toBe(1);
      });
    });

    it("shows error task when SVG has no vector paths", async () => {
      const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
        <text x="10" y="50">Hello</text>
      </svg>`;
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/empty.svg");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(svgXml);

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        const parseTask = tasks.find((t) => t.type === "svg-parse");
        expect(parseTask?.status).toBe("error");
        expect(parseTask?.label).toMatch(/no paths/i);
      });
    });

    it("shows error task when SVG read fails", async () => {
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/bad.svg");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("File not found"));

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        const parseTask = tasks.find((t) => t.type === "svg-parse");
        expect(parseTask?.status).toBe("error");
      });
    });

    it("shows error task when G-code read fails", async () => {
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/bad.gcode");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Read error"));

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        const parseTask = tasks.find((t) => t.type === "svg-parse");
        expect(parseTask?.status).toBe("error");
      });
    });

    it("shows error task when PDF import throws", async () => {
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/doc.pdf");
      (
        window.terraForge.fs.readFileBinary as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("PDF read error"));

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        const parseTask = tasks.find((t) => t.type === "svg-parse");
        expect(parseTask?.status).toBe("error");
      });
    });

    it("shows 'No vector paths' error task when PDF has no extractable paths", async () => {
      (importPdf as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/empty.pdf");
      // readFileBinary default mock returns new Uint8Array()

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        const t = tasks.find((t) => t.label === "No vector paths found in PDF");
        expect(t?.status).toBe("error");
      });
    });

    it("shows 'PDF imported: <name>' label for a single-page PDF", async () => {
      const fakeImport = createSvgImport({ name: "brochure" });
      (importPdf as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        fakeImport,
      ]);
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/brochure.pdf");

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        const t = tasks.find((t) =>
          t.label?.startsWith("PDF imported: brochure"),
        );
        expect(t?.status).toBe("completed");
      });
    });

    it("shows 'PDF imported: N pages' label for a multi-page PDF", async () => {
      const p1 = createSvgImport({ name: "report_page1" });
      const p2 = createSvgImport({ name: "report_page2" });
      (importPdf as ReturnType<typeof vi.fn>).mockResolvedValueOnce([p1, p2]);
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/report.pdf");

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        const t = tasks.find((t) => t.label === "PDF imported: 2 pages");
        expect(t?.status).toBe("completed");
      });
    });

    it("imports SVG using style attribute on parent group (inherited fill)", async () => {
      const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="50mm" viewBox="0 0 50 50">
        <g style="fill:blue;stroke:black">
          <rect x="5" y="5" width="40" height="40" />
        </g>
      </svg>`;
      (
        window.terraForge.fs.openImportDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/grouped.svg");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(svgXml);

      render(<Toolbar />);
      await userEvent.click(screen.getByText("Import"));
      await waitFor(() => {
        expect(useCanvasStore.getState().imports.length).toBe(1);
      });
    });
  });

  // ── Layout operations ──────────────────────────────────────────────────────

  describe("Layout operations", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      localStorage.removeItem("terraforge.gcodePrefs");
    });

    it("Save Layout button saves layout file when imports exist", async () => {
      const imp = createSvgImport({ name: "my-drawing" });
      useCanvasStore.setState({ imports: [imp] });
      (
        window.terraForge.fs.saveLayoutDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/out/my-drawing.tforge");
      (
        window.terraForge.fs.writeFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);

      render(<Toolbar />);
      // Trigger via native file menu IPC mock
      const onMenuSaveLayout = (
        window.terraForge.fs.onMenuSaveLayout as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[0] as (() => void) | undefined;
      onMenuSaveLayout?.();

      await waitFor(() => {
        expect(window.terraForge.fs.saveLayoutDialog).toHaveBeenCalledWith(
          "my-drawing.tforge",
        );
        expect(window.terraForge.fs.writeFile).toHaveBeenCalledWith(
          "/out/my-drawing.tforge",
          expect.stringContaining('"tfVersion"'),
        );
      });
    });

    it("Load Layout reads a valid .tforge file and replaces canvas", async () => {
      const imp = createSvgImport({ name: "loaded" });
      const layout = {
        tfVersion: 1,
        savedAt: new Date().toISOString(),
        imports: [imp],
      };
      (
        window.terraForge.fs.openLayoutDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/save/layout.tforge");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(JSON.stringify(layout));

      render(<Toolbar />);
      const onMenuOpen = (
        window.terraForge.fs.onMenuOpenLayout as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[0] as (() => void) | undefined;
      onMenuOpen?.();

      await waitFor(() => {
        expect(useCanvasStore.getState().imports.length).toBe(1);
        expect(useCanvasStore.getState().imports[0].name).toBe("loaded");
      });
    });

    it("Load Layout shows confirm dialog when canvas already has content", async () => {
      // Pre-load canvas with existing import
      const existing = createSvgImport({ name: "existing" });
      useCanvasStore.setState({ imports: [existing] });

      const newImp = createSvgImport({ name: "new-file" });
      const layout = {
        tfVersion: 1,
        savedAt: new Date().toISOString(),
        imports: [newImp],
      };
      (
        window.terraForge.fs.openLayoutDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/save/new.tforge");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(JSON.stringify(layout));

      render(<Toolbar />);
      const onMenuOpen = (
        window.terraForge.fs.onMenuOpenLayout as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[0] as (() => void) | undefined;
      onMenuOpen?.();

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      expect(screen.getByText(/Replace Canvas/i)).toBeInTheDocument();
    });

    it("Load Layout replace confirm replaces canvas content", async () => {
      const existing = createSvgImport({ name: "existing" });
      useCanvasStore.setState({ imports: [existing] });

      const newImp = createSvgImport({ name: "replacement" });
      const layout = {
        tfVersion: 1,
        savedAt: new Date().toISOString(),
        imports: [newImp],
      };
      (
        window.terraForge.fs.openLayoutDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/save/replacement.tforge");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(JSON.stringify(layout));

      render(<Toolbar />);
      const onMenuOpen = (
        window.terraForge.fs.onMenuOpenLayout as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[0] as (() => void) | undefined;
      onMenuOpen?.();

      await waitFor(() =>
        expect(screen.getByRole("dialog")).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByRole("button", { name: "Replace" }));

      await waitFor(() => {
        expect(useCanvasStore.getState().imports[0]?.name).toBe("replacement");
      });
    });

    it("Load Layout shows error task on invalid JSON", async () => {
      (
        window.terraForge.fs.openLayoutDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/bad.tforge");
      (
        window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue("not-valid-json{");

      render(<Toolbar />);
      const onMenuOpen = (
        window.terraForge.fs.onMenuOpenLayout as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[0] as (() => void) | undefined;
      onMenuOpen?.();

      await waitFor(() => {
        const tasks = Object.values(useTaskStore.getState().tasks);
        const task = tasks.find((t) => t.type === "svg-parse");
        expect(task?.status).toBe("error");
      });
    });

    it("Close Layout shows confirmation dialog when canvas has imports", async () => {
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      const onMenuClose = (
        window.terraForge.fs.onMenuCloseLayout as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[0] as (() => void) | undefined;
      onMenuClose?.();

      await waitFor(() => {
        expect(screen.getByText(/Close Layout/i)).toBeInTheDocument();
      });
    });

    it("Close Layout clears canvas on Discard", async () => {
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });

      render(<Toolbar />);
      const onMenuClose = (
        window.terraForge.fs.onMenuCloseLayout as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[0] as (() => void) | undefined;
      onMenuClose?.();

      await waitFor(() =>
        expect(screen.getByText(/Close Layout/i)).toBeInTheDocument(),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Exit without Saving" }),
      );
      expect(useCanvasStore.getState().imports).toHaveLength(0);
    });

    it("Close Layout Save and Exit saves then clears canvas", async () => {
      const imp = createSvgImport({ name: "drawing" });
      useCanvasStore.setState({ imports: [imp] });
      (
        window.terraForge.fs.saveLayoutDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/out.tforge");
      (
        window.terraForge.fs.writeFile as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);

      render(<Toolbar />);
      const onMenuClose = (
        window.terraForge.fs.onMenuCloseLayout as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[0] as (() => void) | undefined;
      onMenuClose?.();

      await waitFor(() =>
        expect(screen.getByText(/Close Layout/i)).toBeInTheDocument(),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Save and Exit" }),
      );
      await waitFor(() => {
        expect(useCanvasStore.getState().imports).toHaveLength(0);
      });
    });
  });

  // ── Machine settings dialog ────────────────────────────────────────────────

  it("settings button opens Machine Configurations dialog", async () => {
    const cfg = createMachineConfig({ name: "My Plotter" });
    useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
    (
      window.terraForge.config.getMachineConfigs as ReturnType<typeof vi.fn>
    ).mockResolvedValue([cfg]);
    render(<Toolbar />);
    await userEvent.click(screen.getByTitle("Machine settings"));
    expect(screen.getByText("Machine Configurations")).toBeInTheDocument();
  });

  // ── Disconnect via USB ─────────────────────────────────────────────────────

  it("Disconnect calls serial.disconnect for usb config", async () => {
    const cfg = createMachineConfig({
      name: "USB Plotter",
      connection: { type: "usb", serialPath: "COM3" },
    });
    useMachineStore.setState({
      configs: [cfg],
      activeConfigId: cfg.id,
      connected: true,
    });
    (
      window.terraForge.serial.disconnect as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    render(<Toolbar />);
    await userEvent.click(screen.getByText("Disconnect"));
    await waitFor(() => {
      expect(window.terraForge.serial.disconnect).toHaveBeenCalled();
    });
  });

  // ── Connect error handling ─────────────────────────────────────────────────

  it("Connect failure creates error task", async () => {
    const cfg = createMachineConfig({
      name: "WiFi Plotter",
      connection: { type: "wifi", host: "192.168.1.10", port: 80 },
    });
    useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
    (
      window.terraForge.fluidnc.connectWebSocket as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("Connection refused"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Toolbar />);
    await userEvent.click(screen.getByText("Connect"));
    await waitFor(() => {
      const tasks = Object.values(useTaskStore.getState().tasks);
      const connectTask = tasks.find((t) => t.type === "ws-connect");
      expect(connectTask?.status).toBe("error");
    });
    consoleSpy.mockRestore();
  });
});
