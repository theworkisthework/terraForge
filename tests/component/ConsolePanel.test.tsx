import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useConsoleStore } from "@renderer/store/consoleStore";
import { useMachineStore } from "@renderer/store/machineStore";
import { ConsolePanel } from "@renderer/components/ConsolePanel";

beforeEach(() => {
  useConsoleStore.setState({ lines: [], maxLines: 500 });
  useMachineStore.setState({
    configs: [],
    activeConfigId: null,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
  });
  vi.clearAllMocks();
});

describe("ConsolePanel", () => {
  it("renders the Console heading", () => {
    render(<ConsolePanel />);
    expect(screen.getByText("Console")).toBeInTheDocument();
  });

  it("shows console lines from the store", () => {
    useConsoleStore.setState({ lines: ["hello world", "line two"] });
    render(<ConsolePanel />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
    expect(screen.getByText("line two")).toBeInTheDocument();
  });

  it("clears lines when Clear button clicked", async () => {
    useConsoleStore.setState({ lines: ["a line"] });
    render(<ConsolePanel />);
    await userEvent.click(screen.getByText("Clear"));
    expect(useConsoleStore.getState().lines).toEqual([]);
  });

  it("disables command input when not connected", () => {
    render(<ConsolePanel />);
    const input = screen.getByPlaceholderText("Not connected");
    expect(input).toBeDisabled();
  });

  it("enables command input when connected", () => {
    useMachineStore.setState({ connected: true });
    render(<ConsolePanel />);
    const input = screen.getByPlaceholderText("Send command…");
    expect(input).not.toBeDisabled();
  });

  it("shows machine state badge when status is present", () => {
    useMachineStore.setState({
      connected: true,
      status: {
        raw: "<Idle|MPos:0,0,0>",
        state: "Idle",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
      },
    });
    render(<ConsolePanel />);
    expect(screen.getByText("Idle")).toBeInTheDocument();
  });

  it("shows alarm button when state is Alarm", () => {
    useMachineStore.setState({
      connected: true,
      status: {
        raw: "<Alarm|MPos:0,0,0>",
        state: "Alarm",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
      },
    });
    render(<ConsolePanel />);
    expect(screen.getByText(/ALARM/)).toBeInTheDocument();
  });

  it("shows position coordinates when status present", () => {
    useMachineStore.setState({
      connected: true,
      status: {
        raw: "",
        state: "Idle",
        mpos: { x: 10, y: 20, z: 0 },
        wpos: { x: 10.5, y: 20.5, z: 0 },
      },
    });
    render(<ConsolePanel />);
    expect(screen.getByText(/X:10\.50/)).toBeInTheDocument();
  });

  it("shows Restart FW button when connected", () => {
    useMachineStore.setState({ connected: true });
    render(<ConsolePanel />);
    expect(screen.getByText(/Restart FW/)).toBeInTheDocument();
  });

  it("hides Restart FW button when disconnected", () => {
    useMachineStore.setState({ connected: false });
    render(<ConsolePanel />);
    expect(screen.queryByText(/Restart FW/)).not.toBeInTheDocument();
  });

  // ── Auto-scroll ─────────────────────────────────────────────────────────

  it("auto-scrolls when new lines are added", async () => {
    useConsoleStore.setState({ lines: ["line 1"] });
    const { rerender } = render(<ConsolePanel />);
    await act(async () => {
      useConsoleStore.setState({ lines: ["line 1", "line 2"] });
      rerender(<ConsolePanel />);
    });
    // scrollIntoView is stubbed in setup.ts — just verify no crash
    expect(screen.getByText("line 2")).toBeInTheDocument();
  });

  // ── Command send ────────────────────────────────────────────────────────

  it("sends command when Enter pressed and appends to console", async () => {
    useMachineStore.setState({ connected: true });
    render(<ConsolePanel />);
    const input = screen.getByPlaceholderText("Send command…");
    await userEvent.type(input, "G0 X10{Enter}");
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      "G0 X10",
    );
    expect(useConsoleStore.getState().lines).toContain("> G0 X10");
  });

  it("sends command when Send button clicked", async () => {
    useMachineStore.setState({ connected: true });
    render(<ConsolePanel />);
    const input = screen.getByPlaceholderText("Send command…");
    await userEvent.type(input, "$H");
    await userEvent.click(screen.getByText("Send"));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith("$H");
  });

  it("does not send empty command", async () => {
    useMachineStore.setState({ connected: true });
    render(<ConsolePanel />);
    const input = screen.getByPlaceholderText("Send command…");
    await userEvent.type(input, "{Enter}");
    expect(window.terraForge.fluidnc.sendCommand).not.toHaveBeenCalled();
  });

  // ── Alarm unlock ────────────────────────────────────────────────────────

  it("sends $X when alarm button clicked", async () => {
    useMachineStore.setState({
      connected: true,
      status: {
        raw: "<Alarm|MPos:0,0,0>",
        state: "Alarm",
        mpos: { x: 0, y: 0, z: 0 },
        wpos: { x: 0, y: 0, z: 0 },
      },
    });
    render(<ConsolePanel />);
    await userEvent.click(screen.getByText(/ALARM/));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith("$X");
  });

  // ── Restart FW ──────────────────────────────────────────────────────────

  it("sends [ESP444]RESTART and disconnects when Restart FW confirmed", async () => {
    useMachineStore.setState({ connected: true });
    // Mock confirm to return true
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ConsolePanel />);
    await userEvent.click(screen.getByText(/Restart FW/));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      "[ESP444]RESTART",
    );
    expect(window.terraForge.fluidnc.disconnectWebSocket).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  // ── JobControls rendered ────────────────────────────────────────────────

  it("renders JobControls sidebar inside ConsolePanel", () => {
    render(<ConsolePanel />);
    expect(screen.getByText("Job")).toBeInTheDocument();
  });
});
