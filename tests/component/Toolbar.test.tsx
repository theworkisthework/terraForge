import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
