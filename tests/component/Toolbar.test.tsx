import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMachineStore } from "@renderer/store/machineStore";
import { useCanvasStore } from "@renderer/store/canvasStore";
import { useTaskStore } from "@renderer/store/taskStore";
import { Toolbar } from "@renderer/components/Toolbar";
import { createMachineConfig, createSvgImport } from "../helpers/factories";

beforeEach(() => {
  useMachineStore.setState({
    configs: [],
    activeConfigId: null,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
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

  it("renders Import SVG button", () => {
    render(<Toolbar />);
    expect(screen.getByText("Import SVG")).toBeInTheDocument();
  });

  it("renders Import G-code button", () => {
    render(<Toolbar />);
    expect(screen.getByText("Import G-code")).toBeInTheDocument();
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

  // ── Import SVG interaction ─────────────────────────────────────────────

  it("clicking Import SVG opens file dialog", async () => {
    (
      window.terraForge.fs.openSvgDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    render(<Toolbar />);
    await userEvent.click(screen.getByText("Import SVG"));
    expect(window.terraForge.fs.openSvgDialog).toHaveBeenCalled();
  });

  it("imports SVG paths on file selection", async () => {
    const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <path d="M0,0 L50,50" />
    </svg>`;
    (
      window.terraForge.fs.openSvgDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue("/test.svg");
    (
      window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
    ).mockResolvedValue(svgXml);

    render(<Toolbar />);
    await userEvent.click(screen.getByText("Import SVG"));

    await waitFor(() => {
      expect(useCanvasStore.getState().imports.length).toBe(1);
    });
  });

  // ── Import G-code interaction ──────────────────────────────────────────

  it("clicking Import G-code opens gcode file dialog", async () => {
    (
      window.terraForge.fs.openGcodeDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    render(<Toolbar />);
    await userEvent.click(screen.getByText("Import G-code"));
    expect(window.terraForge.fs.openGcodeDialog).toHaveBeenCalled();
  });

  it("parses imported G-code and sets toolpath", async () => {
    const gcode = "G0 X0 Y0\nG1 X10 Y10 F1000\n";
    (
      window.terraForge.fs.openGcodeDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValue("/test.gcode");
    (
      window.terraForge.fs.readFile as ReturnType<typeof vi.fn>
    ).mockResolvedValue(gcode);
    render(<Toolbar />);
    await userEvent.click(screen.getByText("Import G-code"));
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
    render(<Toolbar />);
    // Click Jog to show panel
    await userEvent.click(screen.getByText("Jog"));
    expect(screen.getByText("Jog Controls")).toBeInTheDocument();
    // Click again to hide
    await userEvent.click(screen.getByText("Jog"));
    expect(screen.queryByText("Jog Controls")).not.toBeInTheDocument();
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
        screen.getByRole("heading", { name: "Generate G-code" }),
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

    it("dialog defaults: Optimise=checked, Upload=checked, Save=unchecked", async () => {
      const imp = createSvgImport({ name: "test" });
      useCanvasStore.setState({ imports: [imp] });
      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      const checkboxes = screen.getAllByRole("checkbox");
      // Optimise is first, Upload second, Save third
      expect(checkboxes[0]).toBeChecked(); // Optimise
      expect(checkboxes[1]).toBeChecked(); // Upload to SD
      expect(checkboxes[2]).not.toBeChecked(); // Save to computer
    });

    it("Cancel button closes the dialog without generating", async () => {
      const imp = createSvgImport({ name: "test" });
      useCanvasStore.setState({ imports: [imp] });
      render(<Toolbar />);
      await userEvent.click(screen.getByText("Generate G-code"));
      expect(
        screen.getByRole("heading", { name: "Generate G-code" }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByText("Cancel"));
      expect(
        screen.queryByRole("heading", { name: "Generate G-code" }),
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
      // Defaults: Upload=checked, Save=unchecked
      // Uncheck Upload — now neither is checked
      const checkboxes = screen.getAllByRole("checkbox");
      await userEvent.click(checkboxes[1]); // uncheck Upload to SD
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
        screen.queryByRole("heading", { name: "Generate G-code" }),
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
      // Uncheck Optimise
      const checkboxes = screen.getAllByRole("checkbox");
      await userEvent.click(checkboxes[0]); // uncheck Optimise
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
      // Toggle Save to computer on
      const checkboxes = screen.getAllByRole("checkbox");
      await userEvent.click(checkboxes[2]); // check Save to computer
      await userEvent.click(screen.getByRole("button", { name: "Generate" }));

      const stored = JSON.parse(
        localStorage.getItem("terraforge.gcodePrefs") ?? "{}",
      );
      expect(stored.saveLocally).toBe(true);
    });
  });
});
