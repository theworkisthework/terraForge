import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JogControls } from "@renderer/components/JogControls";
import { useMachineStore } from "@renderer/store/machineStore";
import { createMachineConfig } from "../helpers/factories";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset store to a clean state with no active config between tests
  useMachineStore.setState({
    configs: [],
    activeConfigId: null,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
  });
});

describe("JogControls", () => {
  it("renders the heading", () => {
    render(<JogControls />);
    expect(screen.getByText("Jog Controls")).toBeInTheDocument();
  });

  it("renders step selector buttons", () => {
    render(<JogControls />);
    expect(screen.getByText("0.1")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("renders XY direction buttons", () => {
    render(<JogControls />);
    expect(screen.getByRole("button", { name: "Jog Y+" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jog X-" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jog X+" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jog Y-" })).toBeInTheDocument();
  });

  it("renders pen up/down and zero-Z buttons", () => {
    render(<JogControls />);
    expect(
      screen.getByRole("button", { name: "Pen down" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pen up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zero Z" })).toBeInTheDocument();
  });

  it("renders origin button", () => {
    render(<JogControls />);
    expect(
      screen.getByRole("button", { name: "Go to origin" }),
    ).toBeInTheDocument();
  });

  it("renders Run Homing button", () => {
    render(<JogControls />);
    expect(
      screen.getByRole("button", { name: /Run Homing/i }),
    ).toBeInTheDocument();
  });

  it("renders Set Zero button", () => {
    render(<JogControls />);
    expect(
      screen.getByRole("button", { name: /Set Zero/i }),
    ).toBeInTheDocument();
  });

  it("renders jog speed input with default value", () => {
    render(<JogControls />);
    expect(screen.getByText("Jog Speed (feedrate mm/min)")).toBeInTheDocument();
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(3000);
  });

  it("sends jog command when X+ button clicked", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByRole("button", { name: "Jog X+" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      expect.stringContaining("$J=G91 G21 X"),
    );
  });

  it("sends go-to-origin command when origin button clicked", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByRole("button", { name: "Go to origin" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      "G0 X0 Y0",
    );
  });

  it("sends zero-Z command when Zero Z button clicked", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByRole("button", { name: "Zero Z" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      "G10 L20 P1 Z0",
    );
  });

  it("sends homing command when Run Homing clicked", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByRole("button", { name: /Run Homing/i }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith("$H");
  });

  it("sends set-zero command when Set Zero clicked", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByRole("button", { name: /Set Zero/i }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      "G10 L20 P1 X0 Y0",
    );
  });

  it("renders close button when onClose prop provided", () => {
    const onClose = vi.fn();
    render(<JogControls onClose={onClose} />);
    expect(screen.getByText("✕")).toBeInTheDocument();
  });

  it("does not render close button when onClose not provided", () => {
    render(<JogControls />);
    expect(screen.queryByText("✕")).not.toBeInTheDocument();
  });

  // ── Step selector ───────────────────────────────────────────────────────

  it("changes active step when a step button is clicked", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByText("100"));
    await userEvent.click(screen.getByRole("button", { name: "Jog X+" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      expect.stringContaining("X100"),
    );
  });

  it("sends Y- jog command when Y- button clicked", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByRole("button", { name: "Jog Y-" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      expect.stringContaining("Y-"),
    );
  });

  it("updates feedrate when input changes", async () => {
    render(<JogControls />);
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "6000");
    await userEvent.click(screen.getByRole("button", { name: "Jog X+" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      expect.stringContaining("F6000"),
    );
  });
});

// ── Z axis jog (servo / stepper) ─────────────────────────────────────────────

describe("JogControls — Z jog with servo/stepper pen type", () => {
  beforeEach(() => {
    const cfg = createMachineConfig({
      penType: "servo",
      penUpCommand: "G0Z15",
      penDownCommand: "G0Z0",
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
  });

  it("pen-down sends $J incremental Z- jog (not G0)", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByRole("button", { name: "Pen down" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      expect.stringMatching(/^\$J=G91 G21 Z-[\d.]+/),
    );
    expect(window.terraForge.fluidnc.sendCommand).not.toHaveBeenCalledWith(
      expect.stringContaining("G0 Z"),
    );
  });

  it("pen-up sends $J incremental Z+ jog (not G0)", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByRole("button", { name: "Pen up" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      expect.stringMatching(/^\$J=G91 G21 Z\+?[\d.]+/),
    );
    expect(window.terraForge.fluidnc.sendCommand).not.toHaveBeenCalledWith(
      expect.stringContaining("G0 Z"),
    );
  });

  it("Z jog distance respects selected step size", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByText("10")); // select 10 mm step
    await userEvent.click(screen.getByRole("button", { name: "Pen down" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      "$J=G91 G21 Z-10.000 F3000",
    );
  });

  it("Z jog includes feedrate in command", async () => {
    render(<JogControls />);
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "1500");
    await userEvent.click(screen.getByRole("button", { name: "Pen up" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      expect.stringContaining("F1500"),
    );
  });
});

// ── Z controls with solenoid pen type ────────────────────────────────────────

describe("JogControls — pen commands with solenoid pen type", () => {
  beforeEach(() => {
    const cfg = createMachineConfig({
      penType: "solenoid",
      penUpCommand: "M3S0",
      penDownCommand: "M3S1",
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
  });

  it("pen-down sends configured solenoid command, not a $J jog", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByRole("button", { name: "Pen down" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith("M3S1");
    expect(window.terraForge.fluidnc.sendCommand).not.toHaveBeenCalledWith(
      expect.stringContaining("$J="),
    );
  });

  it("pen-up sends configured solenoid command, not a $J jog", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByRole("button", { name: "Pen up" }));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith("M3S0");
    expect(window.terraForge.fluidnc.sendCommand).not.toHaveBeenCalledWith(
      expect.stringContaining("$J="),
    );
  });
});
