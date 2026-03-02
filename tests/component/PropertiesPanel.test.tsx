import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  // ── Name editing ────────────────────────────────────────────────────────

  it("allows renaming an import via double-click", async () => {
    const imp = createSvgImport({ name: "original" });
    useCanvasStore.setState({ imports: [imp] });
    render(<PropertiesPanel />);
    const nameSpan = screen.getByText("original");
    await userEvent.dblClick(nameSpan);
    // An input should now appear with the current name
    const input = screen.getByDisplayValue("original");
    await userEvent.clear(input);
    await userEvent.type(input, "renamed{Enter}");
    expect(useCanvasStore.getState().imports[0].name).toBe("renamed");
  });

  // ── Visibility toggle ──────────────────────────────────────────────────

  it("toggles import visibility when eye icon clicked", async () => {
    const imp = createSvgImport({ name: "vis-test", visible: true });
    useCanvasStore.setState({ imports: [imp] });
    render(<PropertiesPanel />);
    const eyeIcon = screen.getByText("👁");
    await userEvent.click(eyeIcon);
    expect(useCanvasStore.getState().imports[0].visible).toBe(false);
  });

  // ── Delete import ──────────────────────────────────────────────────────

  it("removes import when ✕ button clicked", async () => {
    const imp = createSvgImport({ name: "to-delete" });
    useCanvasStore.setState({ imports: [imp] });
    render(<PropertiesPanel />);
    const deleteBtn = screen.getByTitle("Delete import");
    await userEvent.click(deleteBtn);
    expect(useCanvasStore.getState().imports).toHaveLength(0);
  });

  // ── Path list expand ───────────────────────────────────────────────────

  it("expands path list when expand toggle is clicked", async () => {
    const p1 = createSvgPath({ layer: "layer1" });
    const p2 = createSvgPath({ layer: "layer2" });
    const imp = createSvgImport({ paths: [p1, p2], name: "multi" });
    useCanvasStore.setState({ imports: [imp] });
    render(<PropertiesPanel />);
    // Click the expand button (▸)
    const expandBtn = screen.getByText("▸");
    await userEvent.click(expandBtn);
    expect(screen.getByText("layer1")).toBeInTheDocument();
    expect(screen.getByText("layer2")).toBeInTheDocument();
  });

  // ── Path visibility toggle ─────────────────────────────────────────────

  it("toggles path visibility in expanded list", async () => {
    const p1 = createSvgPath({ layer: "mypath", visible: true });
    const imp = createSvgImport({ paths: [p1], name: "expand-test" });
    useCanvasStore.setState({ imports: [imp] });
    render(<PropertiesPanel />);
    // Expand first
    await userEvent.click(screen.getByText("▸"));
    // Toggle path visibility (second eye, the first is the import's)
    const allEyes = screen.getAllByText("👁");
    // Last eye is the path's visibility toggle
    await userEvent.click(allEyes[allEyes.length - 1]);
    expect(useCanvasStore.getState().imports[0].paths[0].visible).toBe(false);
  });

  // ── Remove path ────────────────────────────────────────────────────────

  it("removes a single path when its ✕ clicked", async () => {
    const p1 = createSvgPath({ layer: "keep" });
    const p2 = createSvgPath({ layer: "remove" });
    const imp = createSvgImport({ paths: [p1, p2], name: "paths-test" });
    useCanvasStore.setState({ imports: [imp] });
    render(<PropertiesPanel />);
    // Expand
    await userEvent.click(screen.getByText("▸"));
    expect(screen.getByText("remove")).toBeInTheDocument();
    // Click the Remove path button for "remove" path
    const removeBtns = screen.getAllByTitle("Remove path");
    await userEvent.click(removeBtns[1]); // second path
    expect(useCanvasStore.getState().imports[0].paths).toHaveLength(1);
    expect(useCanvasStore.getState().imports[0].paths[0].layer).toBe("keep");
  });

  // ── Path count badge ───────────────────────────────────────────────────

  it("shows path count badge", () => {
    const paths = [createSvgPath(), createSvgPath(), createSvgPath()];
    const imp = createSvgImport({ paths, name: "badge-test" });
    useCanvasStore.setState({ imports: [imp] });
    render(<PropertiesPanel />);
    expect(screen.getByText("3p")).toBeInTheDocument();
  });

  // ── X/Y/W/H/Scale inputs ──────────────────────────────────────────────

  it("updates X position via input", async () => {
    const path = createSvgPath();
    const imp = createSvgImport({ paths: [path], name: "pos-test", x: 0 });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    const xLabel = screen.getByText("X (mm)");
    // eslint-disable-next-line testing-library/no-node-access
    const xInput = xLabel.parentElement!.querySelector("input")!;
    await userEvent.clear(xInput);
    await userEvent.type(xInput, "50");
    expect(useCanvasStore.getState().imports[0].x).toBe(50);
  });

  it("shows Scale input when selected", () => {
    const path = createSvgPath();
    const imp = createSvgImport({ paths: [path], name: "scale-test" });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    expect(screen.getByText("Scale")).toBeInTheDocument();
  });
});
