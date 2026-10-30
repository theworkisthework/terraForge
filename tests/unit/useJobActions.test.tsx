/**
 * G-code generation as useJobActions drives it: which files a job is split
 * into, what they are named, what the task notifications say, and where
 * each file is saved or uploaded. The worker is faked — it answers with
 * G-code naming the objects it was given — so these tests are about the
 * orchestration, not the G-code itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useJobActions } from "@renderer/features/machine/hooks/useJobActions";
import { useCanvasStore } from "@renderer/store/canvasStore";
import { useMachineStore } from "@renderer/store/machineStore";
import { useTaskStore } from "@renderer/store/taskStore";
import { DEFAULT_GCODE_PREFS, type GcodePrefs } from "@renderer/features/gcode-options/gcodePrefs";
import { createMachineConfig, createSvgImport, createSvgPath } from "../helpers/factories";
import type { LayerGroup, VectorObject } from "../../src/types";

/** Objects whose id contains this make the fake worker fail. */
const FAIL_MARK = "fail";

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(msg: { type: string; taskId: string; objects: VectorObject[] }) {
    if (msg.type !== "generate") return;
    const reply = (data: unknown) => queueMicrotask(() => this.onmessage?.({ data }));
    reply({ type: "progress", taskId: msg.taskId, percent: 50, stage: "emitting" });
    if (msg.objects.some((o) => o.id.includes(FAIL_MARK))) reply({ type: "error", taskId: msg.taskId, error: "boom" });
    else reply({ type: "complete", taskId: msg.taskId, gcode: `G:${msg.objects.map((o) => o.id).join(",")}` });
  }
  terminate() {}
}

let labels: string[];
let written: [string, string][];
let uploaded: [string, string][];
let chosenDirectory: string | null;

beforeEach(() => {
  labels = [];
  written = [];
  uploaded = [];
  chosenDirectory = "/out";
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("terraForge", {
    app: { getVersion: () => Promise.resolve("1.0") },
    fs: {
      chooseDirectory: () => Promise.resolve(chosenDirectory),
      saveGcodeDialog: (name: string) => Promise.resolve(`/picked/${name}`),
      writeFile: (path: string, content: string) => (written.push([path, content]), Promise.resolve()),
    },
    fluidnc: {
      uploadGcode: (_task: string, content: string, path: string) => (uploaded.push([path, content]), Promise.resolve()),
    },
  });
  useTaskStore.setState({
    tasks: {},
    upsertTask: (task: { status: string; label: string }) => labels.push(`${task.status}: ${task.label}`),
    registerCancelCallback: () => {},
    unregisterCancelCallback: () => {},
  } as never);
  const config = createMachineConfig({ id: "m1" });
  useMachineStore.setState({ configs: [config], activeConfigId: "m1", connected: true, fwInfo: "FluidNC v3.9" } as never);
  useCanvasStore.setState({ imports: [], layerGroups: [], selectedImportId: null, selectedGroupId: null, pageTemplate: null });
});

afterEach(() => vi.unstubAllGlobals());

async function generate(prefs: Partial<GcodePrefs>) {
  const { result } = renderHook(() => useJobActions());
  await act(async () => {
    await result.current.handleGenerateGcode({ ...DEFAULT_GCODE_PREFS, ...prefs });
  });
  return result;
}

const path = (id: string, extra: Parameters<typeof createSvgPath>[0] = {}) =>
  createSvgPath({ id, d: "M0 0 L10 10", ...extra });

describe("useJobActions G-code generation", () => {
  it("writes one file for the whole drawing, then loads it as the toolpath and queues it", async () => {
    useCanvasStore.setState({ imports: [createSvgImport({ id: "a", name: "logo.svg", paths: [path("a1")] })] });
    await generate({ optimise: true, saveLocally: true, uploadToSd: true });

    expect(uploaded).toEqual([["/logo_opt.gcode", "G:a1"]]);
    expect(written).toEqual([["/picked/logo_opt.gcode", "G:a1"]]);
    expect(labels.at(0)).toBe("running: Preparing G-code");
    expect(labels).toContain("completed: G-code ready");
    expect(useCanvasStore.getState().gcodeToolpath).not.toBeNull();
    expect(useMachineStore.getState().selectedJobFile).toMatchObject({ path: "/logo_opt.gcode", source: "sd" });
  });

  it("skips the upload when not connected", async () => {
    useMachineStore.setState({ connected: false });
    useCanvasStore.setState({ imports: [createSvgImport({ id: "a", name: "logo", paths: [path("a1")] })] });
    await generate({ optimise: false, saveLocally: false, uploadToSd: true });
    expect(uploaded).toEqual([]);
  });

  it("splits by layer group, with ungrouped imports in their own file", async () => {
    const groups: LayerGroup[] = [
      { id: "g1", name: "Red pen", color: "#f00", importIds: ["a"] },
      { id: "g2", name: "Blue/pen", color: "#00f", importIds: ["b"] },
      { id: "g3", name: "Empty", color: "#000", importIds: [] },
    ];
    useCanvasStore.setState({
      imports: [
        createSvgImport({ id: "a", paths: [path("a1")] }),
        createSvgImport({ id: "b", paths: [path("b1")] }),
        createSvgImport({ id: "c", paths: [path("c1")] }),
      ],
      layerGroups: groups,
    });
    await generate({ exportPerGroup: true, optimise: false, saveLocally: true, uploadToSd: true });

    expect(written).toEqual([
      ["/out/ungrouped.gcode", "G:c1"],
      ["/out/Red pen.gcode", "G:a1"],
      ["/out/Blue_pen.gcode", "G:b1"],
    ]);
    expect(uploaded.map(([p]) => p)).toEqual(["/ungrouped.gcode", "/Red pen.gcode", "/Blue_pen.gcode"]);
    expect(labels.filter((l) => l.startsWith("completed"))).toEqual([
      "completed: ungrouped ready",
      "completed: Red pen ready",
      "completed: Blue/pen ready",
    ]);
  });

  it("splits by source layer, naming each file after its import and layer", async () => {
    useCanvasStore.setState({
      imports: [
        createSvgImport({
          id: "a",
          name: "map",
          layers: [
            { id: "L1", name: "Roads", visible: true },
            { id: "L2", name: "Rivers & lakes", visible: true },
          ] as never,
          paths: [path("a1", { layer: "L1" }), path("a2", { layer: "L2" }), path("a3")],
        }),
      ],
    });
    await generate({ exportPerLayer: true, optimise: true, saveLocally: true, uploadToSd: false });

    expect(written).toEqual([
      ["/out/map_Rivers___lakes_opt.gcode", "G:a2"],
      ["/out/map_Roads_opt.gcode", "G:a1"],
    ]);
    expect(labels).toContain("running: Emitting map / Roads…");
    expect(labels).toContain("completed: map / Roads ready");
  });

  it("splits by colour, keeping hatching in separate per-colour files when asked", async () => {
    useCanvasStore.setState({
      imports: [
        createSvgImport({
          id: "a",
          paths: [
            path("a1", { strokeColor: "#ff0000", sourceColor: "#ff0000" }),
            path("a2", { strokeColor: "#3a6aaa", sourceColor: "#3a6aaa", fillColor: "#ff0000", hatchLines: ["M0 0 L5 5"] }),
          ],
        }),
      ],
    });
    await generate({ exportPerColor: true, exportPerHatch: true, optimise: false, saveLocally: true, uploadToSd: false });

    expect(written).toEqual([
      ["/out/test-import_color_hex-3a6aaa.gcode", "G:a2"],
      ["/out/test-import_color_red.gcode", "G:a1"],
      ["/out/test-import_hatch_red.gcode", "G:a2-h0"],
    ]);
    expect(labels).toContain("running: Preparing hatch red…");
    expect(labels).toContain("completed: Hatch red ready");
  });

  it("reports a file that fails and carries on with the rest", async () => {
    useCanvasStore.setState({
      imports: [createSvgImport({ id: "a", paths: [path("a1")] }), createSvgImport({ id: "b", paths: [path(`b-${FAIL_MARK}`)] })],
      layerGroups: [
        { id: "g1", name: "Bad", color: "#000", importIds: ["b"] },
        { id: "g2", name: "Good", color: "#000", importIds: ["a"] },
      ],
    });
    await generate({ exportPerGroup: true, optimise: false, saveLocally: true, uploadToSd: false });

    expect(labels).toContain("error: Bad failed");
    expect(written).toEqual([["/out/Good.gcode", "G:a1"]]);
  });

  it("generates nothing when the folder choice is cancelled", async () => {
    chosenDirectory = null;
    useCanvasStore.setState({
      imports: [createSvgImport({ id: "a", paths: [path("a1", { strokeColor: "#ff0000", sourceColor: "#ff0000" })] })],
    });
    await generate({ exportPerColor: true, optimise: false, saveLocally: true, uploadToSd: true });
    expect(labels).toEqual([]);
    expect(uploaded).toEqual([]);
  });
});
