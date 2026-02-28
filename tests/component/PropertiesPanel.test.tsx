import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useCanvasStore } from "@renderer/store/canvasStore";
import { useMachineStore } from "@renderer/store/machineStore";
import { PropertiesPanel } from "@renderer/components/PropertiesPanel";
import {
  createSvgImport,
  createSvgPath,
  createMachineConfig,
} from "../helpers/factories";

beforeEach(() => {
  useCanvasStore.setState({
    imports: [],
    selectedImportId: null,
    selectedPathId: null,
    gcodeToolpath: null,
  });
  useMachineStore.setState({
    configs: [],
    activeConfigId: null,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
  });
});

describe("PropertiesPanel", () => {
  it("renders the Properties heading", () => {
    render(<PropertiesPanel />);
    expect(screen.getByText("Properties")).toBeInTheDocument();
  });

  it("shows import items when imports exist", () => {
    const imp = createSvgImport({ name: "my-drawing" });
    useCanvasStore.setState({ imports: [imp] });
    render(<PropertiesPanel />);
    expect(screen.getByText("my-drawing")).toBeInTheDocument();
  });

  it("shows 'no imports' placeholder when empty", () => {
    render(<PropertiesPanel />);
    expect(screen.getByText(/No objects/i)).toBeInTheDocument();
  });

  it("shows position controls when an import is selected", () => {
    const path = createSvgPath();
    const imp = createSvgImport({ paths: [path], name: "test" });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    // The properties panel should show position inputs
    expect(screen.getByText("X (mm)")).toBeInTheDocument();
    expect(screen.getByText("Y (mm)")).toBeInTheDocument();
  });
});
