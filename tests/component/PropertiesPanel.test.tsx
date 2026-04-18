import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
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
    pageTemplate: null,
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
    const eyeIcon = screen.getByTitle("Toggle visibility");
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
    // Click the expand button
    const expandBtn = screen.getByRole("button", { name: "Expand paths" });
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
    await userEvent.click(screen.getByRole("button", { name: "Expand paths" }));
    // Toggle path visibility
    await userEvent.click(screen.getByTitle("Toggle path visibility"));
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
    await userEvent.click(screen.getByRole("button", { name: "Expand paths" }));
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
    const xInput = screen.getByRole("spinbutton", { name: "X (mm)" });
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
    const rotInput = screen.getByRole("spinbutton", { name: "Rotation (°)" });
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

  it("template alignment checkbox is disabled when no page template is selected", () => {
    setupAlignmentFixture();
    render(<PropertiesPanel />);
    expect(screen.getByLabelText("Align to template")).toBeDisabled();
  });

  it("aligns to page bounds when template align is enabled with page target", async () => {
    setupAlignmentFixture();
    useCanvasStore.setState({
      pageTemplate: {
        sizeId: "a4",
        landscape: false,
        marginMM: 20,
      },
    });
    render(<PropertiesPanel />);

    await userEvent.click(screen.getByLabelText("Align to template"));
    await userEvent.click(
      screen.getByTitle("Align right edge to page right (X = 110 mm)"),
    );

    expect(useCanvasStore.getState().imports[0].x).toBe(110);
  });

  it("aligns to margin bounds when template align is enabled with margin target", async () => {
    setupAlignmentFixture();
    useCanvasStore.setState({
      pageTemplate: {
        sizeId: "a4",
        landscape: false,
        marginMM: 20,
      },
    });
    render(<PropertiesPanel />);

    const alignToTemplateToggle = screen.getByLabelText("Align to template");
    const alignControls = alignToTemplateToggle.closest("div");

    expect(alignControls).not.toBeNull();

    await userEvent.click(alignToTemplateToggle);
    await userEvent.click(
      within(alignControls as HTMLElement).getByLabelText("Margin"),
    );
    await userEvent.click(
      screen.getByTitle("Align left edge to margin left (X = 20)"),
    );

    expect(useCanvasStore.getState().imports[0].x).toBe(20);
  });

  // ── G-code toolpath panel ──────────────────────────────────────────────────

  it("shows gcode entry when a toolpath is loaded", () => {
    const tp = createGcodeToolpath({ fileSizeBytes: 2048, lineCount: 150 });
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: {
        path: "/tmp/test.gcode",
        name: "test.gcode",
        source: "local" as const,
      },
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
    act(() => {
      useCanvasStore.setState({ toolpathSelected: true });
    });
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
    // Click the expand toggle button
    await userEvent.click(
      screen.getByRole("button", { name: "Expand toolpath details" }),
    );
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
    // Click the collapse toggle button
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse toolpath details" }),
    );
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

  // ── Hatch fill section ─────────────────────────────────────────────────────

  it("does not show hatch section when no paths have hasFill", () => {
    const path = createSvgPath({ hasFill: false });
    const imp = createSvgImport({ paths: [path], name: "no-fill" });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    expect(screen.queryByText("Hatch fill")).not.toBeInTheDocument();
  });

  it("shows hatch section when at least one path has hasFill", () => {
    const path = createSvgPath({ hasFill: true });
    const imp = createSvgImport({
      paths: [path],
      name: "has-fill",
      hatchEnabled: false,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    expect(screen.getByText("Hatch fill")).toBeInTheDocument();
  });

  it("toggle switch calls applyHatch to flip hatchEnabled", async () => {
    const path = createSvgPath({ hasFill: true });
    const imp = createSvgImport({
      paths: [path],
      name: "toggle-test",
      hatchEnabled: false,
      hatchSpacingMM: 2,
      hatchAngleDeg: 45,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);

    const toggle = screen.getByRole("switch");
    await userEvent.click(toggle);
    expect(useCanvasStore.getState().imports[0].hatchEnabled).toBe(true);
  });

  it("hides spacing and angle inputs when hatch is disabled", () => {
    const path = createSvgPath({ hasFill: true });
    const imp = createSvgImport({
      paths: [path],
      name: "hatch-off",
      hatchEnabled: false,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    expect(screen.queryByText("Spacing (mm)")).not.toBeInTheDocument();
    expect(screen.queryByText("Angle (°)")).not.toBeInTheDocument();
  });

  it("shows spacing and angle inputs when hatch is enabled", () => {
    const path = createSvgPath({ hasFill: true });
    const imp = createSvgImport({
      paths: [path],
      name: "hatch-on",
      hatchEnabled: true,
      hatchSpacingMM: 2,
      hatchAngleDeg: 45,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    expect(screen.getByText("Spacing (mm)")).toBeInTheDocument();
    expect(screen.getByText("Angle (°)")).toBeInTheDocument();
  });

  it("spacing input change calls applyHatch with new spacing", async () => {
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: true,
    });
    const imp = createSvgImport({
      paths: [path],
      name: "spacing-test",
      hatchEnabled: true,
      hatchSpacingMM: 2,
      hatchAngleDeg: 45,
      scale: 1,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);

    const spacingInput = screen.getByRole("spinbutton", {
      name: "Spacing (mm)",
    });
    fireEvent.change(spacingInput, { target: { value: "3" } });
    expect(useCanvasStore.getState().imports[0].hatchSpacingMM).toBe(3);
  });

  it("angle input change calls applyHatch with new angle", async () => {
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: true,
    });
    const imp = createSvgImport({
      paths: [path],
      name: "angle-test",
      hatchEnabled: true,
      hatchSpacingMM: 2,
      hatchAngleDeg: 45,
      scale: 1,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);

    const angleInput = screen.getByRole("spinbutton", { name: "Angle (°)" });
    await userEvent.clear(angleInput);
    await userEvent.type(angleInput, "90");
    expect(useCanvasStore.getState().imports[0].hatchAngleDeg).toBe(90);
  });
});

// ── Scale and rotation shortcut buttons ───────────────────────────────────────

describe("PropertiesPanel — scale/rotation shortcut buttons", () => {
  function setupScaleFixture(svgW = 100, svgH = 100) {
    const cfg = createMachineConfig({ bedWidth: 200, bedHeight: 150 });
    const path = createSvgPath();
    const imp = createSvgImport({
      paths: [path],
      name: "scale-shortcut",
      svgWidth: svgW,
      svgHeight: svgH,
      scale: 2,
      rotation: 30,
    });
    useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    return imp;
  }

  // ── Fit to bed ─────────────────────────────────────────────────────────

  it("fit-to-bed button sets scale to min(bedW/svgW, bedH/svgH)", async () => {
    // bedW=200, bedH=150, svgW=100, svgH=100
    // fitScale = min(200/100, 150/100) = min(2, 1.5) = 1.5
    setupScaleFixture();
    render(<PropertiesPanel />);
    const fitBtn = screen.getByTitle(/Fit to bed/);
    await userEvent.click(fitBtn);
    expect(useCanvasStore.getState().imports[0].scale).toBeCloseTo(1.5);
  });

  it("fit-to-bed button resets scaleX and scaleY overrides and positions to 0", async () => {
    setupScaleFixture();
    // Pre-set scaleX/scaleY overrides
    useCanvasStore.setState((s) => ({
      imports: s.imports.map((i) => ({
        ...i,
        scaleX: 3,
        scaleY: 2,
        x: 10,
        y: 20,
      })),
    }));
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle(/Fit to bed/));
    const imp = useCanvasStore.getState().imports[0];
    expect(imp.scaleX).toBeUndefined();
    expect(imp.scaleY).toBeUndefined();
    expect(imp.x).toBe(0);
    expect(imp.y).toBe(0);
  });

  // ── Reset to 1:1 ──────────────────────────────────────────────────────

  it("reset-scale button sets scale to 1", async () => {
    setupScaleFixture();
    render(<PropertiesPanel />);
    const resetBtn = screen.getByTitle(
      "Reset scale + ratio lock to 1:1 (1 SVG unit = 1 mm)",
    );
    await userEvent.click(resetBtn);
    expect(useCanvasStore.getState().imports[0].scale).toBe(1);
  });

  it("reset-scale button clears scaleX and scaleY overrides", async () => {
    setupScaleFixture();
    useCanvasStore.setState((s) => ({
      imports: s.imports.map((i) => ({ ...i, scaleX: 3, scaleY: 2 })),
    }));
    render(<PropertiesPanel />);
    await userEvent.click(
      screen.getByTitle("Reset scale + ratio lock to 1:1 (1 SVG unit = 1 mm)"),
    );
    const imp = useCanvasStore.getState().imports[0];
    expect(imp.scaleX).toBeUndefined();
    expect(imp.scaleY).toBeUndefined();
  });

  // ── CCW / CW rotate ───────────────────────────────────────────────────

  it("CCW button decrements rotation by current step (default 45°)", async () => {
    setupScaleFixture();
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle("Rotate 45° counter-clockwise"));
    expect(useCanvasStore.getState().imports[0].rotation).toBe(-15);
  });

  it("CW button increments rotation by current step (default 45°)", async () => {
    setupScaleFixture();
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle("Rotate 45° clockwise"));
    expect(useCanvasStore.getState().imports[0].rotation).toBe(75);
  });

  // ── Step flyout ───────────────────────────────────────────────────────

  it("clicking step button opens flyout with step options", async () => {
    setupScaleFixture();
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle("Change rotation step"));
    // ROT_STEPS = [1, 5, 15, 30, 45]. Trigger already shows "45°" so check a
    // different step value to avoid multiple-element ambiguity.
    expect(screen.getByText("15°")).toBeInTheDocument();
    expect(screen.getByText("30°")).toBeInTheDocument();
  });

  it("selecting a step from flyout updates the step and closes the flyout", async () => {
    setupScaleFixture();
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle("Change rotation step"));
    // Click the 15° option inside the flyout
    const fifteenBtns = screen.getAllByText("15°");
    // The flyout option is the one inside the dropdown (last one, not the trigger label)
    await userEvent.click(fifteenBtns[fifteenBtns.length - 1]);
    // Flyout should be closed — the 5°/30°/45° options should be gone
    expect(screen.queryByText("45°")).not.toBeInTheDocument();
    // Step trigger should now show 15°
    expect(screen.getByTitle("Change rotation step")).toHaveTextContent("15°");
  });

  it("clicking backdrop closes the flyout", async () => {
    setupScaleFixture();
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle("Change rotation step"));
    // "30°" only appears in the flyout (trigger shows "45°"), so use it to
    // verify the flyout is open and then gone after backdrop click.
    expect(screen.getByText("30°")).toBeInTheDocument();
    const backdrop = document.querySelector(".fixed.inset-0") as HTMLElement;
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop);
    expect(screen.queryByText("30°")).not.toBeInTheDocument();
  });

  // ── Centre marker toggle ──────────────────────────────────────────────

  it("centre marker button toggles showCentreMarker in store", async () => {
    setupScaleFixture();
    useCanvasStore.setState({ showCentreMarker: false });
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle("Show centre marker"));
    expect(useCanvasStore.getState().showCentreMarker).toBe(true);
  });

  it("centre marker button shows 'Hide' title when marker is active", async () => {
    setupScaleFixture();
    useCanvasStore.setState({ showCentreMarker: true });
    render(<PropertiesPanel />);
    expect(screen.getByTitle("Hide centre marker")).toBeInTheDocument();
  });

  // ── Magnet snap ───────────────────────────────────────────────────────

  it("magnet button snaps rotation to first ROT_PRESET when no current preset", async () => {
    setupScaleFixture(); // rotation = 30° (not in ROT_PRESETS)
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle(/Snap to next preset/));
    // norm = 30 → no match in presets → idx = -1 → next = ROT_PRESETS[0] = 0
    expect(useCanvasStore.getState().imports[0].rotation).toBe(0);
  });

  it("magnet button advances to next preset when already on one", async () => {
    const cfg = createMachineConfig({ bedWidth: 200, bedHeight: 150 });
    const path = createSvgPath();
    const imp = createSvgImport({
      paths: [path],
      name: "magnet-preset",
      rotation: 45, // ROT_PRESETS index 1
    });
    useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle(/Snap to next preset/));
    // idx=1 → next = ROT_PRESETS[2] = 90
    expect(useCanvasStore.getState().imports[0].rotation).toBe(90);
  });

  it("magnet wraps from last preset back to first", async () => {
    const cfg = createMachineConfig({ bedWidth: 200, bedHeight: 150 });
    const path = createSvgPath();
    const imp = createSvgImport({
      paths: [path],
      name: "magnet-wrap",
      rotation: 315, // last ROT_PRESET index 7
    });
    useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    await userEvent.click(screen.getByTitle(/Snap to next preset/));
    // idx=7 → (7+1) % 8 = 0 → ROT_PRESETS[0] = 0
    expect(useCanvasStore.getState().imports[0].rotation).toBe(0);
  });

  // ── W / H dimension inputs with ratio lock ───────────────────────────────

  function setupWHFixture() {
    const path = createSvgPath();
    // svgWidth=100, svgHeight=50, scale=1 → W=100mm, H=50mm displayed
    const imp = createSvgImport({
      paths: [path],
      name: "wh-test",
      svgWidth: 100,
      svgHeight: 50,
      scale: 1,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    return imp;
  }

  it("W input (ratio locked) updates scale uniformly", async () => {
    setupWHFixture();
    render(<PropertiesPanel />);
    // W input shows 100; H input shows 50.
    // Unique values: X/Y show 0, Scale shows 1, Rotation shows 0 — so 100 is unique.
    const wInput = screen.getByDisplayValue("100") as HTMLInputElement;
    fireEvent.change(wInput, { target: { value: "200" } });
    const st = useCanvasStore.getState().imports[0];
    // scale = 200/100 = 2, scaleX/scaleY cleared
    expect(st.scale).toBeCloseTo(2);
    expect(st.scaleX).toBeUndefined();
    expect(st.scaleY).toBeUndefined();
  });

  it("H input (ratio locked) updates scale uniformly", async () => {
    setupWHFixture();
    render(<PropertiesPanel />);
    // H input shows 50.
    const hInput = screen.getByDisplayValue("50") as HTMLInputElement;
    fireEvent.change(hInput, { target: { value: "100" } });
    const st = useCanvasStore.getState().imports[0];
    // scale = 100/50 = 2, scaleX/scaleY cleared
    expect(st.scale).toBeCloseTo(2);
    expect(st.scaleX).toBeUndefined();
    expect(st.scaleY).toBeUndefined();
  });

  it("ratio lock button unlocks and sets independent scaleX/scaleY", async () => {
    setupWHFixture();
    render(<PropertiesPanel />);
    const lockBtn = screen.getByTitle("Ratio locked — click to unlock");
    await userEvent.click(lockBtn);
    const st = useCanvasStore.getState().imports[0];
    // After unlock: scaleX = scaleY = imp.scale = 1
    expect(st.scaleX).toBeCloseTo(1);
    expect(st.scaleY).toBeCloseTo(1);
  });

  it("W input (ratio unlocked) updates only scaleX", async () => {
    const path = createSvgPath();
    // Start with independent scales already set (simulates post-unlock)
    const imp = createSvgImport({
      paths: [path],
      name: "wh-unlocked",
      svgWidth: 100,
      svgHeight: 50,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    // Unlock ratio first
    await userEvent.click(screen.getByTitle("Ratio locked — click to unlock"));
    // Now W input: change to 200 → scaleX = 200/100 = 2 only
    const wInput = screen.getByDisplayValue("100") as HTMLInputElement;
    fireEvent.change(wInput, { target: { value: "200" } });
    const st = useCanvasStore.getState().imports[0];
    expect(st.scaleX).toBeCloseTo(2);
    // scaleY unchanged
    expect(st.scaleY).toBeCloseTo(1);
  });

  it("H input (ratio unlocked) updates only scaleY", async () => {
    const path = createSvgPath();
    const imp = createSvgImport({
      paths: [path],
      name: "wh-unlocked-h",
      svgWidth: 100,
      svgHeight: 50,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    // Unlock ratio
    await userEvent.click(screen.getByTitle("Ratio locked — click to unlock"));
    // H input: change to 150 → scaleY = 150/50 = 3
    const hInput = screen.getByDisplayValue("50") as HTMLInputElement;
    fireEvent.change(hInput, { target: { value: "150" } });
    const st = useCanvasStore.getState().imports[0];
    expect(st.scaleY).toBeCloseTo(3);
    expect(st.scaleX).toBeCloseTo(1);
  });

  it("ratio lock button re-locks and clears independent scales", async () => {
    const path = createSvgPath();
    const imp = createSvgImport({
      paths: [path],
      name: "wh-relock",
      svgWidth: 100,
      svgHeight: 50,
      scale: 1,
      scaleX: 2,
      scaleY: 3,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    // The import has independent scales so ratioLocked starts based on state.
    // After unlock click: ratioLocked=false → button shows "Ratio unlocked — click to lock"
    await userEvent.click(screen.getByTitle("Ratio locked — click to unlock"));
    // Now re-lock
    await userEvent.click(screen.getByTitle("Ratio unlocked — click to lock"));
    const st = useCanvasStore.getState().imports[0];
    // scale = scaleX ?? scale = 2, scaleX/scaleY cleared
    expect(st.scale).toBeCloseTo(2);
    expect(st.scaleX).toBeUndefined();
    expect(st.scaleY).toBeUndefined();
  });

  it("horizontal/vertical scale shortcut buttons are disabled while ratio is locked", () => {
    setupWHFixture();
    render(<PropertiesPanel />);

    expect(screen.getByTitle(/Fit horizontal scale/)).toBeDisabled();
    expect(screen.getByTitle(/Fit vertical scale/)).toBeDisabled();
  });

  it("horizontal scale shortcut updates only scaleX and preserves position when ratio is unlocked", async () => {
    const cfg = createMachineConfig({ bedWidth: 200, bedHeight: 150 });
    useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });

    const path = createSvgPath();
    const imp = createSvgImport({
      paths: [path],
      name: "scale-h-shortcut",
      svgWidth: 100,
      svgHeight: 50,
      scale: 1,
      x: 12,
      y: 34,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });

    render(<PropertiesPanel />);

    await userEvent.click(screen.getByTitle("Ratio locked — click to unlock"));
    await userEvent.click(screen.getByTitle(/Fit horizontal scale/));

    const st = useCanvasStore.getState().imports[0];
    expect(st.scaleX).toBeCloseTo(2); // bedW=200, svgWidth=100
    expect(st.scaleY).toBeCloseTo(1);
    expect(st.x).toBe(12);
    expect(st.y).toBe(34);
  });

  it("vertical scale shortcut updates only scaleY and preserves position when ratio is unlocked", async () => {
    const cfg = createMachineConfig({ bedWidth: 200, bedHeight: 150 });
    useMachineStore.setState({ configs: [cfg], activeConfigId: cfg.id });

    const path = createSvgPath();
    const imp = createSvgImport({
      paths: [path],
      name: "scale-v-shortcut",
      svgWidth: 100,
      svgHeight: 50,
      scale: 1,
      x: 9,
      y: 21,
    });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });

    render(<PropertiesPanel />);

    await userEvent.click(screen.getByTitle("Ratio locked — click to unlock"));
    await userEvent.click(screen.getByTitle(/Fit vertical scale/));

    const st = useCanvasStore.getState().imports[0];
    expect(st.scaleY).toBeCloseTo(3); // bedH=150, svgHeight=50
    expect(st.scaleX).toBeCloseTo(1);
    expect(st.x).toBe(9);
    expect(st.y).toBe(21);
  });

  // ── Toolpath statistics edge cases ────────────────────────────────────────

  it("formatBytes shows MB for files over 1 MB", () => {
    const tp = createGcodeToolpath({ fileSizeBytes: 2 * 1024 * 1024 });
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: null,
      toolpathSelected: true,
    });
    render(<PropertiesPanel />);
    expect(screen.getByText("2.0 MB")).toBeInTheDocument();
  });

  it("formatDuration shows hours for very long jobs", () => {
    // 200 000 mm at 3000 mm/min = 66.7 min ≈ 1h 6m
    const tp = createGcodeToolpath({
      totalCutDistance: 200000,
      totalRapidDistance: 0,
      feedrate: 3000,
    });
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: null,
      toolpathSelected: true,
    });
    render(<PropertiesPanel />);
    expect(screen.getByText(/\dh \d+m/)).toBeInTheDocument();
  });

  it("estimateDuration shows '—' when both cut and rapid distances are zero", () => {
    const tp = createGcodeToolpath({
      totalCutDistance: 0,
      totalRapidDistance: 0,
      feedrate: 3000,
    });
    useCanvasStore.setState({
      gcodeToolpath: tp,
      gcodeSource: null,
      toolpathSelected: true,
    });
    render(<PropertiesPanel />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

// ── Stroke width ──────────────────────────────────────────────────────────────

describe("PropertiesPanel — stroke width", () => {
  function getStrokeSlider(): HTMLInputElement {
    return screen.getByRole("slider", {
      name: "Stroke width",
    }) as HTMLInputElement;
  }

  function getStrokeNumberInput(): HTMLInputElement {
    return screen.getByRole("spinbutton", {
      name: "Stroke width value",
    }) as HTMLInputElement;
  }

  it("shows Stroke width section when an import is selected", () => {
    const imp = createSvgImport({ name: "sw-test" });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    expect(screen.getByText("Stroke width")).toBeInTheDocument();
  });

  it("slider defaults to DEFAULT_STROKE_WIDTH_MM (0.5) when strokeWidthMM is unset", () => {
    const imp = createSvgImport({ name: "sw-default" });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    expect(getStrokeSlider().value).toBe("0.5");
  });

  it("slider reflects a custom strokeWidthMM", () => {
    const imp = createSvgImport({ name: "sw-custom", strokeWidthMM: 2.5 });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    expect(getStrokeSlider().value).toBe("2.5");
  });

  it("slider has min=0, max=10, step=0.1", () => {
    const imp = createSvgImport({ name: "sw-attrs" });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    const slider = getStrokeSlider();
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("10");
    expect(slider.step).toBe("0.1");
  });

  it("slider change updates strokeWidthMM on the import", () => {
    const imp = createSvgImport({ name: "sw-change" });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    fireEvent.change(getStrokeSlider(), { target: { value: "1.5" } });
    expect(useCanvasStore.getState().imports[0].strokeWidthMM).toBe(1.5);
  });

  it("number input change updates strokeWidthMM on the import", () => {
    const imp = createSvgImport({ name: "sw-number" });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    fireEvent.change(getStrokeNumberInput(), { target: { value: "3" } });
    expect(useCanvasStore.getState().imports[0].strokeWidthMM).toBe(3);
  });

  it("number input ignores non-finite values", () => {
    const imp = createSvgImport({ name: "sw-nan", strokeWidthMM: 1 });
    useCanvasStore.setState({ imports: [imp], selectedImportId: imp.id });
    render(<PropertiesPanel />);
    fireEvent.change(getStrokeNumberInput(), { target: { value: "" } });
    // strokeWidthMM should remain unchanged
    expect(useCanvasStore.getState().imports[0].strokeWidthMM).toBe(1);
  });

  // ── Group sync ────────────────────────────────────────────────────────

  it("changing stroke on a grouped import syncs all members of the group", () => {
    const imp1 = createSvgImport({ name: "g-imp1", strokeWidthMM: 0.5 });
    const imp2 = createSvgImport({ name: "g-imp2", strokeWidthMM: 0.5 });
    const unrelated = createSvgImport({
      name: "ungrouped",
      strokeWidthMM: 0.5,
    });
    useCanvasStore.getState().addLayerGroup("pen1", "#e94560");
    const group = useCanvasStore.getState().layerGroups[0];
    useCanvasStore.getState().assignImportToGroup(imp1.id, group.id);
    useCanvasStore.getState().assignImportToGroup(imp2.id, group.id);
    useCanvasStore.setState({
      imports: [imp1, imp2, unrelated],
      selectedImportId: imp1.id,
    });
    render(<PropertiesPanel />);

    fireEvent.change(getStrokeSlider(), { target: { value: "2" } });

    const state = useCanvasStore.getState();
    const getImp = (id: string) => state.imports.find((i) => i.id === id)!;
    expect(getImp(imp1.id).strokeWidthMM).toBe(2);
    expect(getImp(imp2.id).strokeWidthMM).toBe(2);
    // Unrelated (ungrouped) import must NOT be affected
    expect(getImp(unrelated.id).strokeWidthMM).toBe(0.5);
  });

  it("changing stroke on an ungrouped import syncs all other ungrouped imports", () => {
    const imp1 = createSvgImport({ name: "ug1", strokeWidthMM: 0.5 });
    const imp2 = createSvgImport({ name: "ug2", strokeWidthMM: 0.5 });
    const grouped = createSvgImport({ name: "grouped", strokeWidthMM: 0.5 });
    useCanvasStore.getState().addLayerGroup("grp", "#3a6aaa");
    const group = useCanvasStore.getState().layerGroups[0];
    useCanvasStore.getState().assignImportToGroup(grouped.id, group.id);
    useCanvasStore.setState({
      imports: [imp1, imp2, grouped],
      selectedImportId: imp1.id,
    });
    render(<PropertiesPanel />);

    fireEvent.change(getStrokeSlider(), { target: { value: "3" } });

    const state = useCanvasStore.getState();
    const getImp = (id: string) => state.imports.find((i) => i.id === id)!;
    expect(getImp(imp1.id).strokeWidthMM).toBe(3);
    expect(getImp(imp2.id).strokeWidthMM).toBe(3);
    // The grouped import must NOT be affected
    expect(getImp(grouped.id).strokeWidthMM).toBe(0.5);
  });
});
