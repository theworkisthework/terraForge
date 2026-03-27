import { describe, it, expect, beforeEach } from "vitest";
import {
  useCanvasStore,
  generateCopyName,
} from "../../../src/renderer/src/store/canvasStore";
import { createSvgImport, createSvgPath } from "../../helpers/factories";

// Reset Zustand state between tests
beforeEach(() => {
  useCanvasStore.setState({
    imports: [],
    selectedImportId: null,
    selectedPathId: null,
    allImportsSelected: false,
    clipboardImport: null,
    gcodeToolpath: null,
    gcodeSource: null,
  });
});

describe("canvasStore", () => {
  // ── addImport / removeImport ──────────────────────────────────────────

  it("starts with empty imports", () => {
    expect(useCanvasStore.getState().imports).toEqual([]);
  });

  it("adds an import", () => {
    const imp = createSvgImport();
    useCanvasStore.getState().addImport(imp);
    expect(useCanvasStore.getState().imports).toHaveLength(1);
    expect(useCanvasStore.getState().imports[0].id).toBe(imp.id);
  });

  it("removes an import by id", () => {
    const imp = createSvgImport();
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().removeImport(imp.id);
    expect(useCanvasStore.getState().imports).toHaveLength(0);
  });

  it("clears selection when removing the selected import", () => {
    const imp = createSvgImport();
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().selectImport(imp.id);
    useCanvasStore.getState().removeImport(imp.id);
    expect(useCanvasStore.getState().selectedImportId).toBeNull();
  });

  // ── updateImport ────────────────────────────────────────────────────────

  it("updates an import's properties", () => {
    const imp = createSvgImport({ x: 0 });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().updateImport(imp.id, { x: 99 });
    expect(useCanvasStore.getState().imports[0].x).toBe(99);
  });

  // ── updatePath / removePath ─────────────────────────────────────────────

  it("updates a path inside an import", () => {
    const path = createSvgPath({ visible: true });
    const imp = createSvgImport({ paths: [path] });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().updatePath(imp.id, path.id, { visible: false });
    expect(useCanvasStore.getState().imports[0].paths[0].visible).toBe(false);
  });

  it("removes a path from an import", () => {
    const path = createSvgPath();
    const imp = createSvgImport({ paths: [path] });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().removePath(imp.id, path.id);
    expect(useCanvasStore.getState().imports[0].paths).toHaveLength(0);
  });

  // ── selectImport ────────────────────────────────────────────────────────

  it("selects an import and clears path selection", () => {
    const imp = createSvgImport();
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().selectImport(imp.id);
    expect(useCanvasStore.getState().selectedImportId).toBe(imp.id);
    expect(useCanvasStore.getState().selectedPathId).toBeNull();
  });

  it("deselects when selecting null", () => {
    const imp = createSvgImport();
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().selectImport(imp.id);
    useCanvasStore.getState().selectImport(null);
    expect(useCanvasStore.getState().selectedImportId).toBeNull();
  });

  // ── clearImports ────────────────────────────────────────────────────────

  it("clears all imports and selections", () => {
    useCanvasStore.getState().addImport(createSvgImport());
    useCanvasStore.getState().addImport(createSvgImport());
    useCanvasStore.getState().clearImports();
    expect(useCanvasStore.getState().imports).toHaveLength(0);
    expect(useCanvasStore.getState().selectedImportId).toBeNull();
  });

  // ── selectedImport ──────────────────────────────────────────────────────

  it("returns the selected import via selectedImport()", () => {
    const imp = createSvgImport();
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().selectImport(imp.id);
    expect(useCanvasStore.getState().selectedImport()?.id).toBe(imp.id);
  });

  it("returns undefined when nothing is selected", () => {
    expect(useCanvasStore.getState().selectedImport()).toBeUndefined();
  });

  // ── setGcodeToolpath ────────────────────────────────────────────────────

  it("stores and clears gcode toolpath", () => {
    const tp = {
      cuts: "M0 0 L10 10",
      rapids: "",
      bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
      lineCount: 2,
    };
    useCanvasStore.getState().setGcodeToolpath(tp);
    expect(useCanvasStore.getState().gcodeToolpath).toEqual(tp);
    useCanvasStore.getState().setGcodeToolpath(null);
    expect(useCanvasStore.getState().gcodeToolpath).toBeNull();
  });

  // ── setGcodeSource ──────────────────────────────────────────────────────

  it("stores and clears gcodeSource", () => {
    const src = {
      path: "/home/user/job.gcode",
      name: "job.gcode",
      source: "local" as const,
    };
    useCanvasStore.getState().setGcodeSource(src);
    expect(useCanvasStore.getState().gcodeSource).toEqual(src);
    useCanvasStore.getState().setGcodeSource(null);
    expect(useCanvasStore.getState().gcodeSource).toBeNull();
  });

  it("auto-clears gcodeSource when setGcodeToolpath(null) is called", () => {
    const tp = { segments: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
    useCanvasStore.getState().setGcodeToolpath(tp as any);
    useCanvasStore.getState().setGcodeSource({
      path: "/job.gcode",
      name: "job.gcode",
      source: "sd" as const,
    });
    expect(useCanvasStore.getState().gcodeSource).not.toBeNull();
    useCanvasStore.getState().setGcodeToolpath(null);
    expect(useCanvasStore.getState().gcodeSource).toBeNull();
  });

  it("does NOT clear gcodeSource when a new toolpath is set", () => {
    const tp = { segments: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
    useCanvasStore.getState().setGcodeSource({
      path: "/job.gcode",
      name: "job.gcode",
      source: "sd" as const,
    });
    useCanvasStore.getState().setGcodeToolpath(tp as any);
    expect(useCanvasStore.getState().gcodeSource).not.toBeNull();
  });

  // ── toVectorObjects ─────────────────────────────────────────────────────

  it("converts visible imports/paths to VectorObjects", () => {
    const path = createSvgPath({ d: "M0 0 L10 10", visible: true });
    const imp = createSvgImport({
      paths: [path],
      visible: true,
      x: 5,
      y: 10,
      scale: 2,
      rotation: 0,
      svgWidth: 100,
      svgHeight: 50,
    });
    useCanvasStore.getState().addImport(imp);
    const objects = useCanvasStore.getState().toVectorObjects();
    expect(objects).toHaveLength(1);
    expect(objects[0].id).toBe(path.id);
    expect(objects[0].x).toBe(5);
    expect(objects[0].y).toBe(10);
    expect(objects[0].scale).toBe(2);
    expect(objects[0].originalWidth).toBe(100);
    expect(objects[0].originalHeight).toBe(50);
  });

  it("excludes hidden imports from toVectorObjects", () => {
    const path = createSvgPath({ visible: true });
    const imp = createSvgImport({ paths: [path], visible: false });
    useCanvasStore.getState().addImport(imp);
    expect(useCanvasStore.getState().toVectorObjects()).toHaveLength(0);
  });

  it("excludes hidden paths from toVectorObjects", () => {
    const path = createSvgPath({ visible: false });
    const imp = createSvgImport({ paths: [path], visible: true });
    useCanvasStore.getState().addImport(imp);
    expect(useCanvasStore.getState().toVectorObjects()).toHaveLength(0);
  });

  it("excludes outline VectorObject when outlineVisible is false", () => {
    const path = createSvgPath({ visible: true, outlineVisible: false });
    const imp = createSvgImport({ paths: [path], visible: true });
    useCanvasStore.getState().addImport(imp);
    const vos = useCanvasStore.getState().toVectorObjects();
    expect(vos).toHaveLength(0);
  });

  it("emits hatch VectorObjects for paths that have hatchLines", () => {
    const path = createSvgPath({
      visible: true,
      hatchLines: ["M0,0 L10,5", "M0,2 L10,7"],
    });
    const imp = createSvgImport({ paths: [path], visible: true });
    useCanvasStore.getState().addImport(imp);
    const vos = useCanvasStore.getState().toVectorObjects();
    // 1 outline + 2 hatch lines
    expect(vos).toHaveLength(3);
  });

  // ── applyHatch ──────────────────────────────────────────────────────────────

  it("applyHatch enables hatch and generates lines for filled paths", () => {
    // A filled square path (10×10 in SVG units, scale 1 → 1 unit = 1 mm)
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: true,
    });
    const imp = createSvgImport({
      paths: [path],
      scale: 1,
      hatchEnabled: false,
    });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().applyHatch(imp.id, 2, 0, true);

    const updated = useCanvasStore.getState().imports[0];
    expect(updated.hatchEnabled).toBe(true);
    expect(updated.hatchSpacingMM).toBe(2);
    expect(updated.hatchAngleDeg).toBe(0);
    expect(updated.paths[0].hatchLines).toBeDefined();
    expect(updated.paths[0].hatchLines!.length).toBeGreaterThan(0);
  });

  it("applyHatch with enabled=false clears hatch lines", () => {
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: true,
      hatchLines: ["M0,1 L10,1"],
    });
    const imp = createSvgImport({
      paths: [path],
      scale: 1,
      hatchEnabled: true,
    });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().applyHatch(imp.id, 2, 0, false);

    const updated = useCanvasStore.getState().imports[0];
    expect(updated.hatchEnabled).toBe(false);
    expect(updated.paths[0].hatchLines).toBeUndefined();
  });

  it("applyHatch does not generate hatch for paths without hasFill", () => {
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: false,
    });
    const imp = createSvgImport({ paths: [path], scale: 1 });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().applyHatch(imp.id, 2, 0, true);

    expect(
      useCanvasStore.getState().imports[0].paths[0].hatchLines,
    ).toBeUndefined();
  });

  it("applyHatch is a no-op for unknown importId", () => {
    useCanvasStore.getState().applyHatch("nonexistent", 2, 0, true);
    // Should not throw and imports remain empty
    expect(useCanvasStore.getState().imports).toHaveLength(0);
  });

  it("applyHatch ignores NaN spacingMM and keeps existing value", () => {
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: true,
    });
    const imp = createSvgImport({
      paths: [path],
      scale: 1,
      hatchSpacingMM: 2,
      hatchEnabled: true,
    });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().applyHatch(imp.id, NaN, 0, true);
    expect(useCanvasStore.getState().imports[0].hatchSpacingMM).toBe(2);
  });

  it("applyHatch ignores NaN angleDeg and keeps existing value", () => {
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: true,
    });
    const imp = createSvgImport({
      paths: [path],
      scale: 1,
      hatchAngleDeg: 45,
      hatchEnabled: true,
    });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().applyHatch(imp.id, 2, NaN, true);
    expect(useCanvasStore.getState().imports[0].hatchAngleDeg).toBe(45);
  });

  it("applyHatch with Infinity angleDeg keeps existing angle", () => {
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: true,
    });
    const imp = createSvgImport({
      paths: [path],
      scale: 1,
      hatchAngleDeg: 30,
      hatchEnabled: true,
    });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().applyHatch(imp.id, 2, Infinity, true);
    expect(useCanvasStore.getState().imports[0].hatchAngleDeg).toBe(30);
  });

  // ── updateImport scale → hatch regeneration ──────────────────────────────────

  it("updateImport regenerates hatch lines when scale changes and hatch is enabled", () => {
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: true,
    });
    const imp = createSvgImport({
      paths: [path],
      scale: 1,
      hatchEnabled: true,
      hatchSpacingMM: 2,
      hatchAngleDeg: 0,
    });
    useCanvasStore.getState().addImport(imp);
    // Apply hatch at scale 1 to get initial lines
    useCanvasStore.getState().applyHatch(imp.id, 2, 0, true);
    const linesBefore =
      useCanvasStore.getState().imports[0].paths[0].hatchLines ?? [];

    // Change scale → should regenerate lines
    useCanvasStore.getState().updateImport(imp.id, { scale: 0.5 });
    const linesAfter =
      useCanvasStore.getState().imports[0].paths[0].hatchLines ?? [];

    // At half scale the spacing in SVG units doubles → half as many lines
    expect(linesAfter.length).toBeLessThan(linesBefore.length);
  });

  it("updateImport does not regenerate hatch when hatch is disabled", () => {
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: true,
      hatchLines: ["M0,2 L10,2"],
    });
    const imp = createSvgImport({
      paths: [path],
      scale: 1,
      hatchEnabled: false,
    });
    useCanvasStore.getState().addImport(imp);
    // Changing scale while hatch is off should NOT touch hatchLines
    useCanvasStore.getState().updateImport(imp.id, { scale: 2 });
    // hatchLines unchanged (still the one we seeded)
    expect(useCanvasStore.getState().imports[0].paths[0].hatchLines).toEqual([
      "M0,2 L10,2",
    ]);
  });

  it("updateImport does not regenerate hatch when non-scale properties change", () => {
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: true,
      hatchLines: ["M0,2 L10,2"],
    });
    const imp = createSvgImport({
      paths: [path],
      scale: 1,
      hatchEnabled: true,
    });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().updateImport(imp.id, { x: 50, rotation: 90 });
    // hatchLines unchanged — position/rotation don't affect spacing
    expect(useCanvasStore.getState().imports[0].paths[0].hatchLines).toEqual([
      "M0,2 L10,2",
    ]);
  });

  it("applyHatch uses geometric mean of scaleX/scaleY for spacing when ratio is unlocked", () => {
    // Non-uniform scaling: scaleX=0.5, scaleY=2 → geometric mean = 1
    // so spacing in SVG units = 2 / 1 = 2 (same as scale=1 uniform)
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: true,
    });
    const imp = createSvgImport({
      paths: [path],
      scale: 1,
      scaleX: 0.5,
      scaleY: 2,
      hatchEnabled: false,
    });
    const impUniform = createSvgImport({
      paths: [
        createSvgPath({ d: "M 0 0 L 10 0 L 10 10 L 0 10 Z", hasFill: true }),
      ],
      scale: 1,
      hatchEnabled: false,
    });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.getState().addImport(impUniform);
    useCanvasStore.getState().applyHatch(imp.id, 2, 0, true);
    useCanvasStore.getState().applyHatch(impUniform.id, 2, 0, true);

    const linesNonUniform =
      useCanvasStore.getState().imports[0].paths[0].hatchLines ?? [];
    const linesUniform =
      useCanvasStore.getState().imports[1].paths[0].hatchLines ?? [];
    // Geometric mean of 0.5*2=1 → same spacing as scale=1 → same number of lines
    expect(linesNonUniform.length).toBe(linesUniform.length);
  });

  // ── updatePath edge cases ────────────────────────────────────────────────

  it("updatePath is a no-op for unknown importId", () => {
    const path = createSvgPath({ visible: true });
    const imp = createSvgImport({ paths: [path] });
    useCanvasStore.getState().addImport(imp);
    // Should not throw and path remains unchanged
    useCanvasStore
      .getState()
      .updatePath("nonexistent", path.id, { visible: false });
    expect(useCanvasStore.getState().imports[0].paths[0].visible).toBe(true);
  });

  // ── removePath edge cases ────────────────────────────────────────────────

  it("removePath clears selectedPathId when the removed path was selected", () => {
    const path = createSvgPath();
    const imp = createSvgImport({ paths: [path] });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.setState({ selectedPathId: path.id });
    useCanvasStore.getState().removePath(imp.id, path.id);
    expect(useCanvasStore.getState().selectedPathId).toBeNull();
  });

  it("removePath does not clear selectedPathId when a different path is removed", () => {
    const path1 = createSvgPath();
    const path2 = createSvgPath();
    const imp = createSvgImport({ paths: [path1, path2] });
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.setState({ selectedPathId: path1.id });
    useCanvasStore.getState().removePath(imp.id, path2.id);
    expect(useCanvasStore.getState().selectedPathId).toBe(path1.id);
  });

  // ── setGcodeToolpath plotProgress clearing ───────────────────────────────

  it("setGcodeToolpath(null) clears plotProgressCuts and plotProgressRapids", () => {
    useCanvasStore.setState({
      plotProgressCuts: "M0 0 L10 10",
      plotProgressRapids: "M10 10 L20 20",
    });
    useCanvasStore.getState().setGcodeToolpath(null);
    expect(useCanvasStore.getState().plotProgressCuts).toBe("");
    expect(useCanvasStore.getState().plotProgressRapids).toBe("");
  });

  it("setGcodeToolpath(null) clears toolpathSelected", () => {
    useCanvasStore.setState({ toolpathSelected: true });
    useCanvasStore.getState().setGcodeToolpath(null);
    expect(useCanvasStore.getState().toolpathSelected).toBe(false);
  });

  // ── loadLayout ────────────────────────────────────────────────────────────

  it("loadLayout replaces imports and clears selection", () => {
    const imp = createSvgImport();
    useCanvasStore.getState().addImport(imp);
    useCanvasStore.setState({ selectedImportId: imp.id, selectedPathId: "p1" });

    const freshImport = createSvgImport({ id: "loaded-1" });
    useCanvasStore.getState().loadLayout([freshImport]);

    expect(useCanvasStore.getState().imports).toHaveLength(1);
    expect(useCanvasStore.getState().imports[0].id).toBe("loaded-1");
    expect(useCanvasStore.getState().selectedImportId).toBeNull();
    expect(useCanvasStore.getState().selectedPathId).toBeNull();
  });

  it("loadLayout applies default hatch settings to ingested imports", () => {
    const freshImport = createSvgImport({ id: "hatch-test" });
    useCanvasStore.getState().loadLayout([freshImport]);
    const loaded = useCanvasStore.getState().imports[0];
    expect(loaded.hatchEnabled).toBe(false);
    expect(typeof loaded.hatchSpacingMM).toBe("number");
    expect(typeof loaded.hatchAngleDeg).toBe("number");
  });

  // ── toggleCentreMarker ────────────────────────────────────────────────────

  it("toggleCentreMarker flips showCentreMarker", () => {
    // Initial store value is true; verify toggling works both ways
    useCanvasStore.setState({ showCentreMarker: true } as any);
    useCanvasStore.getState().toggleCentreMarker();
    expect(useCanvasStore.getState().showCentreMarker).toBe(false);
    useCanvasStore.getState().toggleCentreMarker();
    expect(useCanvasStore.getState().showCentreMarker).toBe(true);
  });

  // ── updateImport non-filled path on scale change ──────────────────────────

  it("updateImport clears hatchLines for non-filled paths when scale changes", () => {
    // Path without fill but with pre-existing hatchLines (edge case: should be cleared)
    const path = createSvgPath({
      d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
      hasFill: false,
      hatchLines: ["M0,1 L10,1"],
    });
    const imp = createSvgImport({
      paths: [path],
      scale: 1,
      hatchEnabled: true,
      hatchSpacingMM: 2,
      hatchAngleDeg: 0,
    });
    useCanvasStore.getState().addImport(imp);
    // Changing scale while hatchEnabled=true triggers the hatch regen block.
    // The path has hasFill=false → `p.hatchLines = undefined; continue;` branch fires.
    useCanvasStore.getState().updateImport(imp.id, { scale: 0.5 });
    expect(
      useCanvasStore.getState().imports[0].paths[0].hatchLines,
    ).toBeUndefined();
  });

  // ── generateCopyName (pure helper) ────────────────────────────────────────

  describe("generateCopyName", () => {
    it("appends ' copy' when no copy exists", () => {
      expect(generateCopyName("my layer", [])).toBe("my layer copy");
    });

    it("appends ' copy (2)' when '<base> copy' already exists", () => {
      expect(generateCopyName("my layer", ["my layer copy"])).toBe(
        "my layer copy (2)",
      );
    });

    it("increments n until a unique name is found", () => {
      expect(
        generateCopyName("my layer", ["my layer copy", "my layer copy (2)"]),
      ).toBe("my layer copy (3)");
    });

    it("strips existing ' copy' suffix before computing base", () => {
      // Copying "foo copy" should produce "foo copy (2)" not "foo copy copy"
      expect(generateCopyName("foo copy", ["foo copy"])).toBe("foo copy (2)");
    });

    it("strips existing ' copy (n)' suffix before computing base", () => {
      expect(generateCopyName("foo copy (3)", ["foo copy"])).toBe(
        "foo copy (2)",
      );
    });
  });

  // ── copyImport / cutImport / pasteImport / selectAllImports ──────────────

  describe("clipboard actions", () => {
    beforeEach(() => {
      useCanvasStore.setState({
        imports: [],
        selectedImportId: null,
        selectedPathId: null,
        clipboardImport: null,
      });
    });

    it("copyImport stores a snapshot in clipboardImport", () => {
      const imp = createSvgImport({ name: "layer1" });
      useCanvasStore.getState().addImport(imp);
      useCanvasStore.getState().copyImport(imp.id);
      expect(useCanvasStore.getState().clipboardImport?.id).toBe(imp.id);
      expect(useCanvasStore.getState().clipboardImport?.name).toBe("layer1");
    });

    it("copyImport does not remove the import from the canvas", () => {
      const imp = createSvgImport();
      useCanvasStore.getState().addImport(imp);
      useCanvasStore.getState().copyImport(imp.id);
      expect(useCanvasStore.getState().imports).toHaveLength(1);
    });

    it("copyImport is a no-op for unknown id", () => {
      useCanvasStore.getState().copyImport("nonexistent");
      expect(useCanvasStore.getState().clipboardImport).toBeNull();
    });

    it("cutImport stores snapshot and removes from canvas", () => {
      const imp = createSvgImport({ name: "to-cut" });
      useCanvasStore.getState().addImport(imp);
      useCanvasStore.getState().selectImport(imp.id);
      useCanvasStore.getState().cutImport(imp.id);
      expect(useCanvasStore.getState().clipboardImport?.name).toBe("to-cut");
      expect(useCanvasStore.getState().imports).toHaveLength(0);
    });

    it("cutImport clears selection when the cut import was selected", () => {
      const imp = createSvgImport();
      useCanvasStore.getState().addImport(imp);
      useCanvasStore.getState().selectImport(imp.id);
      useCanvasStore.getState().cutImport(imp.id);
      expect(useCanvasStore.getState().selectedImportId).toBeNull();
    });

    it("pasteImport adds a copy with ' copy' suffix", () => {
      const imp = createSvgImport({ name: "layer1", x: 0, y: 0 });
      useCanvasStore.getState().addImport(imp);
      useCanvasStore.getState().copyImport(imp.id);
      useCanvasStore.getState().pasteImport();
      const { imports } = useCanvasStore.getState();
      expect(imports).toHaveLength(2);
      expect(imports[1].name).toBe("layer1 copy");
    });

    it("pasteImport offsets position by 5mm", () => {
      const imp = createSvgImport({ x: 10, y: 20 });
      useCanvasStore.getState().addImport(imp);
      useCanvasStore.getState().copyImport(imp.id);
      useCanvasStore.getState().pasteImport();
      const pasted = useCanvasStore.getState().imports[1];
      expect(pasted.x).toBe(15);
      expect(pasted.y).toBe(25);
    });

    it("pasteImport assigns a new unique id", () => {
      const imp = createSvgImport();
      useCanvasStore.getState().addImport(imp);
      useCanvasStore.getState().copyImport(imp.id);
      useCanvasStore.getState().pasteImport();
      const { imports } = useCanvasStore.getState();
      expect(imports[1].id).not.toBe(imports[0].id);
    });

    it("pasteImport assigns new ids to all paths", () => {
      const path = createSvgPath();
      const imp = createSvgImport({ paths: [path] });
      useCanvasStore.getState().addImport(imp);
      useCanvasStore.getState().copyImport(imp.id);
      useCanvasStore.getState().pasteImport();
      const { imports } = useCanvasStore.getState();
      expect(imports[1].paths[0].id).not.toBe(imports[0].paths[0].id);
    });

    it("pasteImport selects the pasted import", () => {
      const imp = createSvgImport();
      useCanvasStore.getState().addImport(imp);
      useCanvasStore.getState().copyImport(imp.id);
      useCanvasStore.getState().pasteImport();
      const { selectedImportId, imports } = useCanvasStore.getState();
      expect(selectedImportId).toBe(imports[1].id);
    });

    it("pasteImport generates incrementing copy names on multiple pastes", () => {
      const imp = createSvgImport({ name: "logo" });
      useCanvasStore.getState().addImport(imp);
      useCanvasStore.getState().copyImport(imp.id);
      useCanvasStore.getState().pasteImport();
      useCanvasStore.getState().pasteImport();
      const names = useCanvasStore.getState().imports.map((i) => i.name);
      expect(names).toContain("logo copy");
      expect(names).toContain("logo copy (2)");
    });

    it("pasteImport is a no-op when clipboard is empty", () => {
      useCanvasStore.getState().pasteImport();
      expect(useCanvasStore.getState().imports).toHaveLength(0);
    });

    it("selectAllImports enters all-selected mode when multiple imports exist and none selected", () => {
      const imp1 = createSvgImport();
      const imp2 = createSvgImport();
      useCanvasStore.getState().addImport(imp1);
      useCanvasStore.getState().addImport(imp2);
      useCanvasStore.getState().selectAllImports();
      expect(useCanvasStore.getState().allImportsSelected).toBe(true);
      expect(useCanvasStore.getState().selectedImportId).toBeNull();
    });

    it("selectAllImports enters all-selected mode when one import is already selected", () => {
      const imp1 = createSvgImport();
      const imp2 = createSvgImport();
      useCanvasStore.getState().addImport(imp1);
      useCanvasStore.getState().addImport(imp2);
      useCanvasStore.getState().selectImport(imp1.id);
      useCanvasStore.getState().selectAllImports();
      expect(useCanvasStore.getState().allImportsSelected).toBe(true);
      expect(useCanvasStore.getState().selectedImportId).toBeNull();
    });

    it("selectAllImports cycles to first import individually when already all-selected", () => {
      const imp1 = createSvgImport();
      const imp2 = createSvgImport();
      useCanvasStore.getState().addImport(imp1);
      useCanvasStore.getState().addImport(imp2);
      useCanvasStore.getState().selectAllImports(); // enter all-selected
      useCanvasStore.getState().selectAllImports(); // cycle to first
      expect(useCanvasStore.getState().allImportsSelected).toBe(false);
      expect(useCanvasStore.getState().selectedImportId).toBe(imp1.id);
    });

    it("selectAllImports selects single import directly when only one exists", () => {
      const imp1 = createSvgImport();
      useCanvasStore.getState().addImport(imp1);
      useCanvasStore.getState().selectAllImports();
      expect(useCanvasStore.getState().allImportsSelected).toBe(false);
      expect(useCanvasStore.getState().selectedImportId).toBe(imp1.id);
    });

    it("selectAllImports is a no-op when no imports exist", () => {
      useCanvasStore.getState().selectAllImports();
      expect(useCanvasStore.getState().selectedImportId).toBeNull();
    });
  });
});
