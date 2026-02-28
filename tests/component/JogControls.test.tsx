import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JogControls } from "@renderer/components/JogControls";

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
    expect(screen.getByText("▲ Y+")).toBeInTheDocument();
    expect(screen.getByText("◄ X-")).toBeInTheDocument();
    expect(screen.getByText("X+ ►")).toBeInTheDocument();
    expect(screen.getByText("Y- ▼")).toBeInTheDocument();
  });

  it("renders Z control buttons", () => {
    render(<JogControls />);
    expect(screen.getByText("Z+")).toBeInTheDocument();
    expect(screen.getByText("Z-")).toBeInTheDocument();
  });

  it("renders home button", () => {
    render(<JogControls />);
    expect(screen.getByText("⌂")).toBeInTheDocument();
  });

  it("renders feedrate input with default value", () => {
    render(<JogControls />);
    // Label is not linked via htmlFor, so use the text then find the sibling input
    expect(screen.getByText("Feedrate mm/min")).toBeInTheDocument();
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(3000);
  });

  it("sends jog command when direction button clicked", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByText("X+ ►"));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      expect.stringContaining("$J=G91 G21 X"),
    );
  });

  it("sends Z jog command", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByText("Z+"));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith(
      expect.stringContaining("$J=G91 G21 Z"),
    );
  });

  it("sends home command when ⌂ clicked", async () => {
    render(<JogControls />);
    await userEvent.click(screen.getByText("⌂"));
    expect(window.terraForge.fluidnc.sendCommand).toHaveBeenCalledWith("G0 X0 Y0");
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
});

// Need vi import for vi.fn()
import { vi } from "vitest";
