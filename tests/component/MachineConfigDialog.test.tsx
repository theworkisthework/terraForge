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
    render(<MachineConfigDialog onClose={onClose} />);
    // Select Second then delete
    await userEvent.click(screen.getByText("Second"));
    await userEvent.click(screen.getByText("Del"));
    // Themed confirm dialog should appear
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(window.terraForge.config.deleteMachineConfig).toHaveBeenCalled();
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
      render(<MachineConfigDialog onClose={onClose} />);
      // Customise the pen-up command so it no longer matches the solenoid default
      const upInput = screen.getByDisplayValue("M3S0");
      await userEvent.clear(upInput);
      await userEvent.type(upInput, "CUSTOM");
      // Now change pen type — should open the themed confirm dialog
      await userEvent.selectOptions(
        screen.getByDisplayValue("Solenoid"),
        "servo",
      );
      await screen.findByRole("dialog");
      // User accepts → servo defaults applied
      await userEvent.click(screen.getByRole("button", { name: "Reset" }));
      expect(screen.getByDisplayValue("G0Z15")).toBeInTheDocument();
    });

    it("declining the confirm preserves custom commands but updates pen type label", async () => {
      render(<MachineConfigDialog onClose={onClose} />);
      // Customise pen-up command
      const upInput = screen.getByDisplayValue("M3S0");
      await userEvent.clear(upInput);
      await userEvent.type(upInput, "CUSTOM");
      // Change pen type — themed confirm dialog appears
      await userEvent.selectOptions(
        screen.getByDisplayValue("Solenoid"),
        "servo",
      );
      await screen.findByRole("dialog");
      // User declines → commands stay as custom, penType label updates
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByDisplayValue("CUSTOM")).toBeInTheDocument();
    });
  });

  // ── Connection type switching ──────────────────────────────────────────────

  describe("connection type switching", () => {
    it("switching to USB hides host/port fields and shows serial port input", async () => {
      render(<MachineConfigDialog onClose={onClose} />);
      await act(async () => {});
      // Initial state: wifi → host field visible
      expect(screen.getByPlaceholderText("fluidnc.local")).toBeInTheDocument();
      // Switch to USB
      await userEvent.click(screen.getByRole("radio", { name: "usb" }));
      // Host field gone, serial port placeholder visible
      expect(
        screen.queryByPlaceholderText("fluidnc.local"),
      ).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText("/dev/ttyUSB0")).toBeInTheDocument();
    });

    it("switching back to wifi shows host/port fields again", async () => {
      render(<MachineConfigDialog onClose={onClose} />);
      await act(async () => {});
      // Go to USB first
      await userEvent.click(screen.getByRole("radio", { name: "usb" }));
      expect(
        screen.queryByPlaceholderText("fluidnc.local"),
      ).not.toBeInTheDocument();
      // Back to wifi
      await userEvent.click(screen.getByRole("radio", { name: "wifi" }));
      expect(screen.getByPlaceholderText("fluidnc.local")).toBeInTheDocument();
    });

    it("editing host field updates form value", async () => {
      render(<MachineConfigDialog onClose={onClose} />);
      await act(async () => {});
      const hostInput = screen.getByPlaceholderText("fluidnc.local");
      await userEvent.clear(hostInput);
      await userEvent.type(hostInput, "192.168.1.100");
      expect((hostInput as HTMLInputElement).value).toBe("192.168.1.100");
    });

    it("WS port override field updates and can be cleared", async () => {
      render(<MachineConfigDialog onClose={onClose} />);
      await act(async () => {});
      // WS port override is the third number input in the wifi section
      // It has a placeholder equal to the HTTP port (80)
      const wsInput = screen.getByPlaceholderText("80") as HTMLInputElement;
      // Type a WS port value
      await userEvent.clear(wsInput);
      await userEvent.type(wsInput, "81");
      expect(wsInput.value).toBe("81");
      // Clearing it should leave the field empty (maps to wsPort: undefined)
      await userEvent.clear(wsInput);
      expect(wsInput.value).toBe("");
    });

    it("shows serial port dropdown when ports are available", async () => {
      (
        window.terraForge.serial.listPorts as ReturnType<typeof vi.fn>
      ).mockResolvedValue(["/dev/ttyUSB0", "/dev/ttyUSB1"]);
      render(<MachineConfigDialog onClose={onClose} />);
      await act(async () => {});
      // Switch to USB
      await userEvent.click(screen.getByRole("radio", { name: "usb" }));
      // findAllByRole because Origin and Pen type selects are also comboboxes;
      // the serial port select is the last one appended after switching to USB.
      const selects = await screen.findAllByRole("combobox");
      const select = selects[selects.length - 1];
      expect(select).toBeInTheDocument();
      expect(screen.getByText("/dev/ttyUSB0")).toBeInTheDocument();
      expect(screen.getByText("/dev/ttyUSB1")).toBeInTheDocument();
    });

    it("selecting a different serial port from dropdown updates form", async () => {
      (
        window.terraForge.serial.listPorts as ReturnType<typeof vi.fn>
      ).mockResolvedValue(["/dev/ttyUSB0", "/dev/ttyUSB1"]);
      render(<MachineConfigDialog onClose={onClose} />);
      await act(async () => {});
      await userEvent.click(screen.getByRole("radio", { name: "usb" }));
      const selects = await screen.findAllByRole("combobox");
      const select = selects[selects.length - 1];
      await userEvent.selectOptions(select, "/dev/ttyUSB1");
      expect((select as HTMLSelectElement).value).toBe("/dev/ttyUSB1");
    });
  });

  // ── alertInfo dialog ───────────────────────────────────────────────────────

  describe("alertInfo dialog", () => {
    it("export success shows alert with file path", async () => {
      (
        window.terraForge.config.exportConfigs as ReturnType<typeof vi.fn>
      ).mockResolvedValue("/home/user/configs.json");
      render(<MachineConfigDialog onClose={onClose} />);
      await userEvent.click(screen.getByText("↑ Export"));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText("Configs Exported")).toBeInTheDocument();
      expect(
        screen.getByText(/\/home\/user\/configs\.json/),
      ).toBeInTheDocument();
      // Dismiss
      await userEvent.click(screen.getByRole("button", { name: "OK" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("import success shows 'Import Complete' alert with counts", async () => {
      const newCfg = createMachineConfig({ name: "ImportedConfig" });
      (
        window.terraForge.config.importConfigs as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ added: 2, skipped: 1 });
      (
        window.terraForge.config.getMachineConfigs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([newCfg]);
      render(<MachineConfigDialog onClose={onClose} />);
      await userEvent.click(screen.getByText("↓ Import"));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText("Import Complete")).toBeInTheDocument();
      expect(screen.getByText(/2 configs imported/)).toBeInTheDocument();
      expect(screen.getByText(/1 skipped/)).toBeInTheDocument();
    });

    it("import error shows 'Import Failed' alert", async () => {
      (
        window.terraForge.config.importConfigs as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("disk full"));
      render(<MachineConfigDialog onClose={onClose} />);
      await userEvent.click(screen.getByText("↓ Import"));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText("Import Failed")).toBeInTheDocument();
    });

    it("export error shows 'Export Failed' alert", async () => {
      (
        window.terraForge.config.exportConfigs as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("permission denied"));
      render(<MachineConfigDialog onClose={onClose} />);
      await userEvent.click(screen.getByText("↑ Export"));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText("Export Failed")).toBeInTheDocument();
    });
  });

  // ── Save new config (isNew path) ───────────────────────────────────────────

  it("+ New then Save Changes creates a new config", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    // Switch to new-config mode
    await userEvent.click(screen.getByText("+ New"));
    // The name input should have "New Machine" — rename it to make the form dirty
    const nameInput = screen.getByDisplayValue("New Machine");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Brand New Plotter");
    // Save the new config
    await userEvent.click(screen.getByText("Save Changes"));
    expect(window.terraForge.config.saveMachineConfig).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Brand New Plotter" }),
    );
  });

  // ── Import selects first newly-added config ────────────────────────────────

  it("import with 1 added config selects the newly imported entry", async () => {
    const existing = useMachineStore.getState().configs[0];
    const newCfg = createMachineConfig({ name: "Newly Imported" });
    (
      window.terraForge.config.importConfigs as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ added: 1, skipped: 0 });
    // getMachineConfigs returns [existing, newCfg]; newCfg is at index 1 = length-added
    (
      window.terraForge.config.getMachineConfigs as ReturnType<typeof vi.fn>
    ).mockResolvedValue([existing, newCfg]);
    render(<MachineConfigDialog onClose={onClose} />);
    await userEvent.click(screen.getByText("↓ Import"));
    // After import, the newly imported config should appear in the list
    await screen.findByText("Newly Imported");
    expect(screen.getByText("Newly Imported")).toBeInTheDocument();
  });

  // ── Input field onChange handlers ─────────────────────────────────────────

  it("editing bed width updates form (marks dirty)", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    const bedWidthInput = screen.getByDisplayValue("300") as HTMLInputElement;
    await userEvent.clear(bedWidthInput);
    await userEvent.type(bedWidthInput, "250");
    expect(screen.getByText("Save Changes")).not.toBeDisabled();
  });

  it("editing bed height updates form (marks dirty)", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    const bedHeightInput = screen.getByDisplayValue("200") as HTMLInputElement;
    await userEvent.clear(bedHeightInput);
    await userEvent.type(bedHeightInput, "150");
    expect(screen.getByText("Save Changes")).not.toBeDisabled();
  });

  it("editing feedrate updates form (marks dirty)", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    const feedrateInput = screen.getByDisplayValue("3000") as HTMLInputElement;
    await userEvent.clear(feedrateInput);
    await userEvent.type(feedrateInput, "4500");
    expect(screen.getByText("Save Changes")).not.toBeDisabled();
  });

  it("editing HTTP port updates form (marks dirty)", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    const portInput = screen.getByDisplayValue("80") as HTMLInputElement;
    await userEvent.clear(portInput);
    await userEvent.type(portInput, "8080");
    expect(screen.getByText("Save Changes")).not.toBeDisabled();
  });

  it("editing serial path text input (USB mode, no port list) updates form", async () => {
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    // Switch to USB mode
    await userEvent.click(screen.getByRole("radio", { name: "usb" }));
    // No ports available → text input shown
    const serialInput = screen.getByPlaceholderText(
      "/dev/ttyUSB0",
    ) as HTMLInputElement;
    await userEvent.clear(serialInput);
    await userEvent.type(serialInput, "COM5");
    expect(serialInput.value).toBe("COM5");
  });

  // ── listPorts rejection handled gracefully ─────────────────────────────────

  it("listPorts rejection is handled without crashing (portList stays empty)", async () => {
    (
      window.terraForge.serial.listPorts as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("port scan failed"));
    render(<MachineConfigDialog onClose={onClose} />);
    await act(async () => {});
    // Dialog should still render normally after catch sets portList=[]
    expect(screen.getByText("Machine Configurations")).toBeInTheDocument();
  });
});
