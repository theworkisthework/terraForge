import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore } from "../../../src/renderer/src/store/canvasStore";
import { createSvgImport, createSvgPath } from "../../helpers/factories";

// Reset Zustand state between tests
beforeEach(() => {
  useCanvasStore.setState({
    imports: [],
    selectedImportId: null,
    selectedPathId: null,
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
    const src = { path: "/home/user/job.gcode", name: "job.gcode" };
    useCanvasStore.getState().setGcodeSource(src);
    expect(useCanvasStore.getState().gcodeSource).toEqual(src);
    useCanvasStore.getState().setGcodeSource(null);
    expect(useCanvasStore.getState().gcodeSource).toBeNull();
  });

  it("auto-clears gcodeSource when setGcodeToolpath(null) is called", () => {
    const tp = { segments: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
    useCanvasStore.getState().setGcodeToolpath(tp as any);
    useCanvasStore
      .getState()
      .setGcodeSource({ path: "/job.gcode", name: "job.gcode" });
    expect(useCanvasStore.getState().gcodeSource).not.toBeNull();
    useCanvasStore.getState().setGcodeToolpath(null);
    expect(useCanvasStore.getState().gcodeSource).toBeNull();
  });

  it("does NOT clear gcodeSource when a new toolpath is set", () => {
    const tp = { segments: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
    useCanvasStore
      .getState()
      .setGcodeSource({ path: "/job.gcode", name: "job.gcode" });
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
});
