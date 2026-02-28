import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMachineStore } from "@renderer/store/machineStore";
import { MachineConfigDialog } from "@renderer/components/MachineConfigDialog";
import { createMachineConfig } from "../helpers/factories";

beforeEach(() => {
  const cfg = createMachineConfig({
    name: "Test Plotter",
    bedWidth: 300,
    bedHeight: 200,
    origin: "bottom-left",
    penType: "solenoid",
    penUpCommand: "M3S0",
    penDownCommand: "M3S1",
    feedrate: 3000,
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
  vi.clearAllMocks();
  // listPorts is called on mount
  (window.terraForge.serial.listPorts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("MachineConfigDialog", () => {
  const onClose = vi.fn();

  it("renders the dialog heading", () => {
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText("Machine Configurations")).toBeInTheDocument();
  });

  it("shows the existing config in the sidebar", () => {
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText("Test Plotter")).toBeInTheDocument();
  });

  it("renders General, Pen Commands, and Connection sections", () => {
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Pen Commands")).toBeInTheDocument();
    expect(screen.getByText("Connection")).toBeInTheDocument();
  });

  it("renders form fields for bed dimensions", () => {
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText("Bed width (mm)")).toBeInTheDocument();
    expect(screen.getByText("Bed height (mm)")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await userEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when × button clicked", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await userEvent.click(screen.getByText("×"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Save Changes button as 'Saved' initially", () => {
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows + New, Copy, Del buttons", () => {
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText("+ New")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Del")).toBeInTheDocument();
  });

  it("shows Export and Import buttons", () => {
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText("↑ Export")).toBeInTheDocument();
    expect(screen.getByText("↓ Import")).toBeInTheDocument();
  });

  it("shows Set as Active button", () => {
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText("Set as Active")).toBeInTheDocument();
  });

  it("shows locked banner when connected to active config", () => {
    useMachineStore.setState({ connected: true });
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText(/disconnect to edit/i)).toBeInTheDocument();
  });

  it("shows pen command fields", () => {
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText("Pen up command")).toBeInTheDocument();
    expect(screen.getByText("Pen down command")).toBeInTheDocument();
  });

  it("shows swap and reset buttons for pen commands", () => {
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText("⇕ Swap up / down")).toBeInTheDocument();
    expect(screen.getByText("↺ Reset to defaults")).toBeInTheDocument();
  });

  it("renders wifi/usb radio options", () => {
    render(<MachineConfigDialog onClose={onClose} />);
    expect(screen.getByText("wifi")).toBeInTheDocument();
    expect(screen.getByText("usb")).toBeInTheDocument();
  });
});
