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
/** ...make it die without a word, as a worker whose script throws does. */
const CRASH_MARK = "crash";
/** ...make it never answer. */
const HANG_MARK = "hang";

let terminated: number;
/** When set, constructing a worker throws this. */
let workerConstructionError: Error | null;

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  constructor() {
    if (workerConstructionError) throw workerConstructionError;
  }
  postMessage(msg: { type: string; taskId: string; objects: VectorObject[] }) {
    if (msg.type !== "generate") return;
    const has = (mark: string) => msg.objects.some((o) => o.id.includes(mark));
    const reply = (data: unknown) => queueMicrotask(() => this.onmessage?.({ data }));
    reply({ type: "progress", taskId: msg.taskId, percent: 50, stage: "emitting" });
    if (has(HANG_MARK)) return;
    if (has(CRASH_MARK)) queueMicrotask(() => this.onerror?.({ message: "worker blew up" }));
    else if (has(FAIL_MARK)) reply({ type: "error", taskId: msg.taskId, error: "boom" });
    else reply({ type: "complete", taskId: msg.taskId, gcode: `G:${msg.objects.map((o) => o.id).join(",")}` });
  }
  terminate() {
    terminated++;
  }
}

let labels: string[];
/** The error text of each error task, by label. */
let errors: Record<string, string | undefined>;
let written: [string, string][];
let uploaded: [string, string][];
let chosenDirectory: string | null;
/** Paths containing this cannot be written. */
let unwritable: string | null;
/** Cancel callbacks of the tasks now running. */
let cancels: Map<string, () => void>;

beforeEach(() => {
  labels = [];
  written = [];
  uploaded = [];
  chosenDirectory = "/out";
  errors = {};
  unwritable = null;
  cancels = new Map();
  terminated = 0;
  workerConstructionError = null;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("terraForge", {
    app: { getVersion: () => Promise.resolve("1.0") },
    fs: {
      chooseDirectory: () => Promise.resolve(chosenDirectory),
      saveGcodeDialog: (name: string) => Promise.resolve(`/picked/${name}`),
      writeFile: (path: string, content: string) => {
        if (unwritable && path.includes(unwritable)) return Promise.reject(new Error("EACCES: permission denied"));
        written.push([path, content]);
        return Promise.resolve();
      },
    },
    fluidnc: {
      uploadGcode: (_task: string, content: string, path: string) => (uploaded.push([path, content]), Promise.resolve()),
    },
  });
  useTaskStore.setState({
    tasks: {},
    upsertTask: (task: { status: string; label: string; error?: string }) => {
      labels.push(`${task.status}: ${task.label}`);
      if (task.status === "error") errors[task.label] = task.error;
    },
    registerCancelCallback: (id: string, cancel: () => void) => void cancels.set(id, cancel),
    unregisterCancelCallback: (id: string) => void cancels.delete(id),
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

  describe("when generation goes wrong", () => {
    const twoGroups = (firstPathId: string) =>
      useCanvasStore.setState({
        imports: [createSvgImport({ id: "a", paths: [path("a1")] }), createSvgImport({ id: "b", paths: [path(firstPathId)] })],
        layerGroups: [
          { id: "g1", name: "First", color: "#000", importIds: ["b"] },
          { id: "g2", name: "Second", color: "#000", importIds: ["a"] },
        ],
      });

    it("reports a worker that dies, and is no longer generating", async () => {
      useCanvasStore.setState({ imports: [createSvgImport({ id: "a", paths: [path(`a-${CRASH_MARK}`)] })] });
      const result = await generate({ saveLocally: true, uploadToSd: true });

      expect(labels.at(-1)).toBe("error: G-code failed");
      expect(errors["G-code failed"]).toBe("worker blew up");
      expect(result.current.generating).toBe(false);
      expect(written).toEqual([]);
      expect(uploaded).toEqual([]);
      expect(terminated).toBe(1);
      expect(cancels.size).toBe(0);
    });

    it("reports a worker that cannot be started", async () => {
      workerConstructionError = new Error("no workers here");
      useCanvasStore.setState({ imports: [createSvgImport({ id: "a", paths: [path("a1")] })] });
      const result = await generate({ saveLocally: true });

      expect(labels).toEqual(["running: Preparing G-code", "error: G-code failed"]);
      expect(errors["G-code failed"]).toBe("no workers here");
      expect(result.current.generating).toBe(false);
    });

    it("carries on with the other files when one file's worker dies", async () => {
      twoGroups(`b-${CRASH_MARK}`);
      await generate({ exportPerGroup: true, optimise: false, saveLocally: true, uploadToSd: false });

      expect(labels).toContain("error: First failed");
      expect(written).toEqual([["/out/Second.gcode", "G:a1"]]);
    });

    it("reports a failure before generation starts, and is no longer generating", async () => {
      useCanvasStore.setState({
        imports: [createSvgImport({ id: "a", paths: [path("a1", { strokeColor: "#ff0000", sourceColor: "#ff0000" })] })],
      });
      window.terraForge.fs.chooseDirectory = () => Promise.reject(new Error("dialog failed"));
      const result = await generate({ exportPerColor: true, saveLocally: true });

      expect(labels).toEqual(["error: G-code failed"]);
      expect(errors["G-code failed"]).toBe("dialog failed");
      expect(result.current.generating).toBe(false);
    });

    it("reports a whole-job file that cannot be saved", async () => {
      unwritable = "/picked/";
      useCanvasStore.setState({ imports: [createSvgImport({ id: "a", name: "logo", paths: [path("a1")] })] });
      const result = await generate({ optimise: false, saveLocally: true, uploadToSd: false });

      expect(labels.at(-1)).toBe("error: Could not save logo.gcode");
      expect(errors["Could not save logo.gcode"]).toBe("EACCES: permission denied");
      expect(result.current.generating).toBe(false);
    });

    it("reports a split file that cannot be saved, still uploads it, and carries on", async () => {
      unwritable = "First";
      twoGroups("b1");
      await generate({ exportPerGroup: true, optimise: false, saveLocally: true, uploadToSd: true });

      expect(errors["Could not save First.gcode"]).toBe("EACCES: permission denied");
      expect(written).toEqual([["/out/Second.gcode", "G:a1"]]);
      expect(uploaded.map(([p]) => p)).toEqual(["/First.gcode", "/Second.gcode"]);
    });
  });

  describe("cancelling", () => {
    /** Starts a job, and resolves once a worker is running and can be cancelled. */
    async function start(prefs: Partial<GcodePrefs>) {
      const { result } = renderHook(() => useJobActions());
      let done!: Promise<void>;
      await act(async () => {
        done = result.current.handleGenerateGcode({ ...DEFAULT_GCODE_PREFS, ...prefs });
        await vi.waitFor(() => expect(cancels.size).toBe(1));
      });
      const cancel = async () => {
        await act(async () => {
          [...cancels.values()][0]();
          await done;
        });
      };
      return { result, cancel };
    }

    it("stops a whole job whose worker is not answering", async () => {
      useCanvasStore.setState({ imports: [createSvgImport({ id: "a", paths: [path(`a-${HANG_MARK}`)] })] });
      const { result, cancel } = await start({ saveLocally: true, uploadToSd: true });
      expect(result.current.generating).toBe(true);
      await cancel();

      expect(labels.at(-1)).toBe("cancelled: G-code cancelled");
      expect(terminated).toBe(1);
      expect(result.current.generating).toBe(false);
      expect(written).toEqual([]);
      expect(uploaded).toEqual([]);
    });

    it("stops the rest of a split job, saying that files were skipped", async () => {
      useCanvasStore.setState({
        imports: [createSvgImport({ id: "a", paths: [path("a1")] }), createSvgImport({ id: "b", paths: [path(`b-${HANG_MARK}`)] })],
        layerGroups: [
          { id: "g1", name: "First", color: "#000", importIds: ["b"] },
          { id: "g2", name: "Second", color: "#000", importIds: ["a"] },
        ],
      });
      const { result, cancel } = await start({ exportPerGroup: true, optimise: false, saveLocally: true, uploadToSd: true });
      await cancel();

      expect(labels.at(-1)).toBe("cancelled: Export cancelled — remaining files skipped");
      expect(labels.some((l) => l.includes("Second"))).toBe(false);
      expect(written).toEqual([]);
      expect(uploaded).toEqual([]);
      expect(result.current.generating).toBe(false);
    });

    it("names the file when the last file of a split job is cancelled", async () => {
      useCanvasStore.setState({
        imports: [createSvgImport({ id: "a", paths: [path("a1")] }), createSvgImport({ id: "b", paths: [path(`b-${HANG_MARK}`)] })],
        layerGroups: [
          { id: "g1", name: "Alpha", color: "#000", importIds: ["a"] },
          { id: "g2", name: "Omega", color: "#000", importIds: ["b"] },
        ],
      });
      const { cancel } = await start({ exportPerGroup: true, optimise: false, saveLocally: true, uploadToSd: false });
      await cancel();

      expect(written).toEqual([["/out/Alpha.gcode", "G:a1"]]);
      expect(labels.at(-1)).toBe("cancelled: Omega cancelled");
    });

    it("skips the hatch files when a colour file is cancelled", async () => {
      useCanvasStore.setState({
        imports: [
          createSvgImport({
            id: "a",
            paths: [
              // Not "a-hang": "-h" in an id marks a hatch line.
              path(`${HANG_MARK}1`, {
                strokeColor: "#ff0000",
                sourceColor: "#ff0000",
                fillColor: "#ff0000",
                hatchLines: ["M0 0 L5 5"],
              }),
            ],
          }),
        ],
      });
      const { cancel } = await start({ exportPerColor: true, exportPerHatch: true, optimise: false, saveLocally: true });
      await cancel();

      expect(labels.at(-1)).toBe("cancelled: Export cancelled — remaining files skipped");
      expect(labels.some((l) => l.toLowerCase().includes("hatch"))).toBe(false);
      expect(written).toEqual([]);
    });
  });
});
