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
  createGcodeToolpath,
} from "../helpers/factories";

beforeEach(() => {
  useCanvasStore.setState({
    imports: [],
    selectedImportId: null,
    selectedPathId: null,
    gcodeToolpath: null,
    toolpathSelected: false,
  });
  useMachineStore.setState({
    configs: [],
    activeConfigId: null,
    status: null,
    connected: false,
    wsLive: false,
    selectedJobFile: null,
    fwInfo: null,
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

  it("shows Rotation input when selected", () => {
    const path = createSvgPath();
    const imp = createSvgImport({ paths: [path], name: "rot-test" });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    expect(screen.getByText("Rotation (°)")).toBeInTheDocument();
  });

  it("updates rotation via input", async () => {
    const path = createSvgPath();
    const imp = createSvgImport({
      paths: [path],
      name: "rot-update",
      rotation: 0,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    const rotLabel = screen.getByText("Rotation (°)");
    // eslint-disable-next-line testing-library/no-node-access
    const rotInput = rotLabel.parentElement!.querySelector("input")!;
    await userEvent.clear(rotInput);
    await userEvent.type(rotInput, "45");
    expect(useCanvasStore.getState().imports[0].rotation).toBe(45);
  });

  // ── Alignment buttons ──────────────────────────────────────────────────
  // Default import: svgWidth=100, svgHeight=100, scale=1 → object is 100×100 mm
  // Default bed (from createMachineConfig): 220×200 mm
  // Expected positions: left=0, centreH=60, right=120, bottom=0, centreV=50, top=100

  function setupAlignmentFixture() {
    const cfg = createMachineConfig(); // bedWidth:220, bedHeight:200
    const path = createSvgPath();
    const imp = createSvgImport({
      paths: [path],
      name: "align-test",
      x: 50,
      y: 50,
      svgWidth: 100,
      svgHeight: 100,
      scale: 1,
    });
    useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    return imp;
  }

  it("align left sets x to 0", async () => {
    setupAlignmentFixture();
    render(<PropertiesPanel />);
    await userEvent.click(
      screen.getByTitle("Align left edge to bed left (X = 0)"),
    );
    expect(useCanvasStore.getState().imports[0].x).toBe(0);
  });

  it("align centre horizontal sets x to (bedW - objW) / 2", async () => {
    setupAlignmentFixture();
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle("Centre horizontally (X = 60 mm)"));
    expect(useCanvasStore.getState().imports[0].x).toBe(60);
  });

  it("align right sets x to bedW - objW", async () => {
    setupAlignmentFixture();
    render(<PropertiesPanel />);
    await userEvent.click(
      screen.getByTitle("Align right edge to bed right (X = 120 mm)"),
    );
    expect(useCanvasStore.getState().imports[0].x).toBe(120);
  });

  it("align top sets y to bedH - objH", async () => {
    setupAlignmentFixture();
    render(<PropertiesPanel />);
    await userEvent.click(
      screen.getByTitle("Align top edge to bed top (Y = 100 mm)"),
    );
    expect(useCanvasStore.getState().imports[0].y).toBe(100);
  });

  it("align centre vertical sets y to (bedH - objH) / 2", async () => {
    setupAlignmentFixture();
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle("Centre vertically (Y = 50 mm)"));
    expect(useCanvasStore.getState().imports[0].y).toBe(50);
  });

  it("align bottom sets y to 0", async () => {
    setupAlignmentFixture();
    render(<PropertiesPanel />);
    await userEvent.click(
      screen.getByTitle("Align bottom edge to bed bottom (Y = 0)"),
    );
    expect(useCanvasStore.getState().imports[0].y).toBe(0);
  });

  // ── G-code toolpath panel ──────────────────────────────────────────────────

  it("shows gcode entry when a toolpath is loaded", () => {
    const tp = createGcodeToolpath({ fileSizeBytes: 2048, lineCount: 150 });
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: { path: "/tmp/test.gcode", name: "test.gcode" },
    });
    render(<PropertiesPanel />);
    expect(screen.getByText("test.gcode")).toBeInTheDocument();
  });

  it("shows gcode properties expanded by default", () => {
    const tp = createGcodeToolpath({ fileSizeBytes: 1024, lineCount: 80 });
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: null,
      toolpathSelected: false,
    });
    render(<PropertiesPanel />);
    // Collapsed when not selected — stats hidden
    expect(screen.queryByText("Lines")).not.toBeInTheDocument();
    useCanvasStore.setState({ toolpathSelected: true });
  });

  it("shows file size formatted in KB", () => {
    const tp = createGcodeToolpath({ fileSizeBytes: 2048 });
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: null,
      toolpathSelected: true,
    });
    render(<PropertiesPanel />);
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("shows estimated duration based on feedrate and distances", () => {
    // 3000 mm at 3000 mm/min = 1 min cut; rapid negligible
    const tp = createGcodeToolpath({
      totalCutDistance: 3000,
      totalRapidDistance: 0,
      feedrate: 3000,
    });
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: null,
      toolpathSelected: true,
    });
    render(<PropertiesPanel />);
    expect(screen.getByText("Est. duration")).toBeInTheDocument();
    expect(screen.getByText("1m 0s")).toBeInTheDocument();
  });

  it("shows feedrate row when feedrate is non-zero", () => {
    const tp = createGcodeToolpath({ feedrate: 2500 });
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: null,
      toolpathSelected: true,
    });
    render(<PropertiesPanel />);
    expect(screen.getByText("Feedrate")).toBeInTheDocument();
    expect(screen.getByText("2500 mm/min")).toBeInTheDocument();
  });

  it("hides feedrate row when feedrate is 0", () => {
    const tp = createGcodeToolpath({ feedrate: 0 });
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: null,
      toolpathSelected: true,
    });
    render(<PropertiesPanel />);
    expect(screen.queryByText("Feedrate")).not.toBeInTheDocument();
  });

  it("expands gcode properties when header clicked (sets toolpathSelected)", async () => {
    const tp = createGcodeToolpath();
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: null,
      toolpathSelected: false,
    });
    render(<PropertiesPanel />);
    // Stats are initially hidden (not selected)
    expect(screen.queryByText("Lines")).not.toBeInTheDocument();
    // Click the collapse toggle button (▸ = collapsed)
    await userEvent.click(screen.getByText("▸"));
    expect(useCanvasStore.getState().toolpathSelected).toBe(true);
    expect(screen.getByText("Lines")).toBeInTheDocument();
  });

  it("collapses gcode properties when header clicked while selected", async () => {
    const tp = createGcodeToolpath();
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: null,
      toolpathSelected: true,
    });
    render(<PropertiesPanel />);
    // Stats are visible while selected
    expect(screen.getByText("Lines")).toBeInTheDocument();
    // Click the expand toggle button (▾ = expanded/selected)
    await userEvent.click(screen.getByText("▾"));
    expect(useCanvasStore.getState().toolpathSelected).toBe(false);
    expect(screen.queryByText("Lines")).not.toBeInTheDocument();
  });

  it("clears the toolpath when the ✕ button is clicked", async () => {
    const tp = createGcodeToolpath();
    useCanvasStore.setState({ gcodeToolpath: tp, gcodeSource: null });
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle("Clear toolpath"));
    expect(useCanvasStore.getState().gcodeToolpath).toBeNull();
  });

  it("shows 'no objects' placeholder only when no imports AND no toolpath", () => {
    useCanvasStore.setState({ imports: [], gcodeToolpath: null });
    render(<PropertiesPanel />);
    expect(screen.getByText(/No objects/i)).toBeInTheDocument();
  });

  it("hides 'no objects' placeholder when a toolpath is loaded with no imports", () => {
    const tp = createGcodeToolpath();
    useCanvasStore.setState({ imports: [], gcodeToolpath: tp });
    render(<PropertiesPanel />);
    expect(screen.queryByText(/No objects/i)).not.toBeInTheDocument();
  });
});
