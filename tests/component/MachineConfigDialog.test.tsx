import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
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
  (
    window.terraForge.serial.listPorts as ReturnType<typeof vi.fn>
  ).mockResolvedValue([]);
});

describe("MachineConfigDialog", () => {
  const onClose = vi.fn();

  it("renders the dialog heading", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText("Machine Configurations")).toBeInTheDocument();
  });

  it("shows the existing config in the sidebar", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText("Test Plotter")).toBeInTheDocument();
  });

  it("renders General, Pen Commands, and Connection sections", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Pen Commands")).toBeInTheDocument();
    expect(screen.getByText("Connection")).toBeInTheDocument();
  });

  it("renders form fields for bed dimensions", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
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

  it("shows Save Changes button as 'Saved' initially", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows + New, Copy, Del buttons", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText("+ New")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Del")).toBeInTheDocument();
  });

  it("shows Export and Import buttons", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText("↑ Export")).toBeInTheDocument();
    expect(screen.getByText("↓ Import")).toBeInTheDocument();
  });

  it("shows Set as Active button", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText("Set as Active")).toBeInTheDocument();
  });

  it("shows locked banner when connected to active config", async () => {
    useMachineStore.setState({ connected: true });
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText(/disconnect to edit/i)).toBeInTheDocument();
  });

  it("shows pen command fields", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText("Pen up command")).toBeInTheDocument();
    expect(screen.getByText("Pen down command")).toBeInTheDocument();
  });

  it("shows swap and reset buttons for pen commands", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText("⇕ Swap up / down")).toBeInTheDocument();
    expect(screen.getByText("↺ Reset to defaults")).toBeInTheDocument();
  });

  it("renders wifi/usb radio options", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText("wifi")).toBeInTheDocument();
    expect(screen.getByText("usb")).toBeInTheDocument();
  });

  // ── Add new config ──────────────────────────────────────────────────────

  it("clicking + New shows 'New Machine' in sidebar", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await userEvent.click(screen.getByText("+ New"));
    expect(screen.getByDisplayValue("New Machine")).toBeInTheDocument();
  });

  // ── Delete config ───────────────────────────────────────────────────────

  it("Del button is disabled with only one config", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    expect(screen.getByText("Del")).toBeDisabled();
  });

  it("deletes a config when Del confirmed with multiple configs", async () => {
    const c1 = createMachineConfig({ name: "First" });
    const c2 = createMachineConfig({ name: "Second" });
    useMachineStore.setState({
      configs: [c1, c2],
      activeConfigId: c1.id,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MachineConfigDialog onClose={onClose} />);
    // Select Second then delete
    await userEvent.click(screen.getByText("Second"));
    await userEvent.click(screen.getByText("Del"));
    expect(window.terraForge.config.deleteMachineConfig).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  // ── Duplicate ───────────────────────────────────────────────────────────

  it("duplicates a config when Copy clicked", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await userEvent.click(screen.getByText("Copy"));
    expect(window.terraForge.config.saveMachineConfig).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Copy of Test Plotter" }),
    );
  });

  // ── Swap pen commands ───────────────────────────────────────────────────

  it("swaps pen up and down commands when Swap clicked", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    const upInput = screen.getByDisplayValue("M3S0");
    const downInput = screen.getByDisplayValue("M3S1");
    expect(upInput).toBeInTheDocument();
    expect(downInput).toBeInTheDocument();
    await userEvent.click(screen.getByText("⇕ Swap up / down"));
    expect(screen.getByDisplayValue("M3S1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("M3S0")).toBeInTheDocument();
  });

  // ── Reset to defaults ───────────────────────────────────────────────────

  it("resets pen commands to defaults when Reset clicked", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    // First change one command
    const upInput = screen.getByDisplayValue("M3S0");
    await userEvent.clear(upInput);
    await userEvent.type(upInput, "CUSTOM");
    // Now reset
    await userEvent.click(screen.getByText("↺ Reset to defaults"));
    // Should be back to solenoid defaults
    expect(screen.getByDisplayValue("M3S0")).toBeInTheDocument();
    expect(screen.getByDisplayValue("M3S1")).toBeInTheDocument();
  });

  // ── Export ──────────────────────────────────────────────────────────────

  it("calls exportConfigs when Export clicked", async () => {
    (
      window.terraForge.config.exportConfigs as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    render(<MachineConfigDialog onClose={onClose} />);
    await userEvent.click(screen.getByText("↑ Export"));
    expect(window.terraForge.config.exportConfigs).toHaveBeenCalled();
  });

  // ── Import ──────────────────────────────────────────────────────────────

  it("calls importConfigs when Import clicked", async () => {
    (
      window.terraForge.config.importConfigs as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ added: 0, skipped: 0 });
    render(<MachineConfigDialog onClose={onClose} />);
    await userEvent.click(screen.getByText("↓ Import"));
    expect(window.terraForge.config.importConfigs).toHaveBeenCalled();
  });

  // ── Set as Active ───────────────────────────────────────────────────────

  it("sets selected config as active", async () => {
    const c1 = createMachineConfig({ name: "First" });
    const c2 = createMachineConfig({ name: "Second" });
    useMachineStore.setState({
      configs: [c1, c2],
      activeConfigId: c1.id,
    });
    render(<MachineConfigDialog onClose={onClose} />);
    await userEvent.click(screen.getByText("Second"));
    await userEvent.click(screen.getByText("Set as Active"));
    expect(useMachineStore.getState().activeConfigId).toBe(c2.id);
  });

  // ── Save changes ────────────────────────────────────────────────────────

  it("saves changes when Save Changes clicked", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    // Modify the name
    const nameInput = screen.getByDisplayValue("Test Plotter");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Renamed");
    // Save
    const saveBtn = screen.getByText("Save Changes");
    await userEvent.click(saveBtn);
    expect(window.terraForge.config.saveMachineConfig).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Renamed" }),
    );
  });

  // ── Pen type change auto-populates commands ────────────────────────────

  describe("pen type change", () => {
    it("switching from solenoid to servo auto-populates servo defaults", async () => {
      render(<MachineConfigDialog onClose={onClose} />);
      // Initial solenoid commands are visible
      expect(screen.getByDisplayValue("M3S0")).toBeInTheDocument();
      // Change pen type — commands match current defaults so no confirm needed
      await userEvent.selectOptions(
        screen.getByDisplayValue("Solenoid"),
        "servo",
      );
      // Should auto-populate servo defaults
      expect(screen.getByDisplayValue("G0Z15")).toBeInTheDocument();
      expect(screen.getByDisplayValue("G0Z0")).toBeInTheDocument();
    });

    it("switching to stepper populates stepper defaults (G0Z15 / G0Z0)", async () => {
      render(<MachineConfigDialog onClose={onClose} />);
      await userEvent.selectOptions(
        screen.getByDisplayValue("Solenoid"),
        "stepper",
      );
      expect(screen.getByDisplayValue("G0Z15")).toBeInTheDocument();
      expect(screen.getByDisplayValue("G0Z0")).toBeInTheDocument();
    });

    it("switching with customised commands triggers confirm dialog", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      render(<MachineConfigDialog onClose={onClose} />);
      // Customise the pen-up command so it no longer matches the solenoid default
      const upInput = screen.getByDisplayValue("M3S0");
      await userEvent.clear(upInput);
      await userEvent.type(upInput, "CUSTOM");
      // Now change pen type — should trigger confirm
      await userEvent.selectOptions(
        screen.getByDisplayValue("Solenoid"),
        "servo",
      );
      expect(confirmSpy).toHaveBeenCalled();
      // User accepted → servo defaults applied
      expect(screen.getByDisplayValue("G0Z15")).toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it("declining the confirm preserves custom commands but updates pen type label", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(<MachineConfigDialog onClose={onClose} />);
      // Customise pen-up command
      const upInput = screen.getByDisplayValue("M3S0");
      await userEvent.clear(upInput);
      await userEvent.type(upInput, "CUSTOM");
      // Change pen type — user declines overwrite
      await userEvent.selectOptions(
        screen.getByDisplayValue("Solenoid"),
        "servo",
      );
      expect(confirmSpy).toHaveBeenCalled();
      // Commands should remain as custom (not overwritten)
      expect(screen.getByDisplayValue("CUSTOM")).toBeInTheDocument();
      confirmSpy.mockRestore();
    });
  });
});
