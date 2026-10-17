import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useBitmapPluginStore } from "@renderer/store/bitmapPluginStore";
import { useCanvasStore } from "@renderer/store/canvasStore";
import type { BitmapPluginManifest, SvgImport } from "@types/index";

vi.mock("@renderer/features/bitmap-renderers/bitmapImage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@renderer/features/bitmap-renderers/bitmapImage")>();
  return { ...actual, materializeBitmapLayers: vi.fn() };
});

import {
  bitmapRenderSignature,
  materializeBitmapLayers,
} from "@renderer/features/bitmap-renderers/bitmapImage";
import {
  flushBitmapRenders,
  RENDER_DEBOUNCE_MS,
  rerenderBitmap,
  startBitmapRenderService,
  useBitmapRenderStatusStore,
} from "@renderer/features/bitmap-renderers/bitmapRenderService";

const materialize = vi.mocked(materializeBitmapLayers);

function bitmapImport(overrides: Partial<SvgImport> = {}): SvgImport {
  return {
    id: "bmp-1",
    name: "photo",
    kind: "bitmap",
    paths: [],
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    svgWidth: 100,
    svgHeight: 100,
    viewBoxX: 0,
    viewBoxY: 0,
    bitmapDataUrl: "data:image/png;base64,AAAA",
    bitmapRendererId: "spiral-amplitude",
    bitmapRendererSettings: { spacingMM: 8 },
    bitmapRendererPath: "M0 0",
    ...overrides,
  };
}

/** An import whose stored output already matches its settings. */
function renderedImport(overrides: Partial<SvgImport> = {}): SvgImport {
  const imp = bitmapImport(overrides);
  return { ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) };
}

const stored = (id = "bmp-1") => useCanvasStore.getState().imports.find((imp) => imp.id === id)!;
const statusOf = (id = "bmp-1") => useBitmapRenderStatusStore.getState().entries[id]?.status ?? "idle";

let stopService: () => void = () => {};

beforeEach(() => {
  materialize.mockReset();
  materialize.mockResolvedValue({ bitmapRendererPath: "M1 1", paths: [], rendererVersion: "1/new" });
  useBitmapPluginStore.setState({ plugins: [] });
  useCanvasStore.setState({ imports: [] });
  // Started for every test so that stopping it afterwards clears any job a
  // test leaves behind; tests that need it absent stop it themselves.
  stopService = startBitmapRenderService();
});

afterEach(() => {
  stopService();
  vi.useRealTimers();
});

describe("flushBitmapRenders", () => {
  it("renders a stale bitmap immediately rather than waiting out the debounce", async () => {
    useCanvasStore.setState({ imports: [bitmapImport({ bitmapRenderSignature: "stale" })] });

    await flushBitmapRenders();

    expect(materialize).toHaveBeenCalledTimes(1);
    expect(stored().bitmapRendererPath).toBe("M1 1");
    expect(stored().bitmapRenderSignature).toBe(bitmapRenderSignature(stored()));
  });

  it("works even when the background service is not running", async () => {
    stopService();
    useCanvasStore.setState({ imports: [bitmapImport({ bitmapRenderSignature: "stale" })] });

    await flushBitmapRenders();

    expect(stored().bitmapRendererPath).toBe("M1 1");
  });

  it("re-renders an import that goes stale again while its last render is still holding the label", async () => {
    vi.useFakeTimers();
    const stale = bitmapImport({ bitmapRenderSignature: "stale" });
    useCanvasStore.setState({ imports: [stale] });
    await vi.advanceTimersByTimeAsync(450);
    expect(stored().bitmapRendererPath).toBe("M1 1");
    expect(statusOf()).toBe("rendering");

    // Undo restores the pre-render state: same settings, old output.
    useCanvasStore.setState({ imports: [stale] });
    expect(statusOf()).toBe("pending");
    await vi.advanceTimersByTimeAsync(450);

    expect(materialize).toHaveBeenCalledTimes(2);
    expect(stored().bitmapRendererPath).toBe("M1 1");
  });

  it("waits for a render that is already in flight instead of starting another", async () => {
    let finish!: () => void;
    materialize.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ bitmapRendererPath: "M2 2", paths: [] });
      }),
    );
    useCanvasStore.setState({ imports: [bitmapImport({ bitmapRenderSignature: "stale" })] });

    const first = flushBitmapRenders();
    await vi.waitFor(() => expect(materialize).toHaveBeenCalledTimes(1));
    const second = flushBitmapRenders();
    finish();
    await Promise.all([first, second]);

    expect(materialize).toHaveBeenCalledTimes(1);
    expect(stored().bitmapRendererPath).toBe("M2 2");
  });

  it("does nothing when every bitmap is already up to date", async () => {
    useCanvasStore.setState({ imports: [renderedImport()] });

    await flushBitmapRenders();

    expect(materialize).not.toHaveBeenCalled();
  });

  it("plots output from an older renderer as shown, rather than re-rendering it unasked", async () => {
    useCanvasStore.setState({ imports: [renderedImport({ bitmapRendererVersion: "0/old" })] });

    await flushBitmapRenders();

    expect(materialize).not.toHaveBeenCalled();
    expect(stored().bitmapRendererPath).toBe("M0 0");
  });

  it("ignores hidden bitmaps, which do not reach the output", async () => {
    useCanvasStore.setState({ imports: [bitmapImport({ bitmapRenderSignature: "stale", visible: false })] });

    await flushBitmapRenders();

    expect(materialize).not.toHaveBeenCalled();
  });

  it("rejects, naming the import and the cause, when a render fails", async () => {
    materialize.mockRejectedValue(new Error('Bitmap renderer "gone" is not installed.'));
    useCanvasStore.setState({ imports: [bitmapImport({ bitmapRenderSignature: "stale" })] });

    await expect(flushBitmapRenders()).rejects.toThrow(/"photo": Bitmap renderer "gone" is not installed/);
    expect(stored().bitmapRendererPath).toBe("M0 0");
  });

  it("retries a render that previously failed", async () => {
    materialize.mockRejectedValueOnce(new Error("boom"));
    useCanvasStore.setState({ imports: [bitmapImport({ bitmapRenderSignature: "stale" })] });

    await expect(flushBitmapRenders()).rejects.toThrow(/boom/);
    await flushBitmapRenders();

    expect(stored().bitmapRendererPath).toBe("M1 1");
  });
});

describe("rerenderBitmap", () => {
  it("re-renders an up-to-date bitmap on request and records the renderer version", async () => {
    useCanvasStore.setState({ imports: [renderedImport({ bitmapRendererVersion: "0/old" })] });

    await rerenderBitmap("bmp-1");

    expect(materialize).toHaveBeenCalledTimes(1);
    expect(stored()).toMatchObject({ bitmapRendererPath: "M1 1", bitmapRendererVersion: "1/new" });
  });
});

describe("render warnings", () => {
  it("stores a render's warnings with its output, and clears them once a render has none", async () => {
    materialize.mockResolvedValueOnce({ bitmapRendererPath: "M1 1", paths: [], warnings: ["Cut short"] });
    useCanvasStore.setState({ imports: [bitmapImport({ bitmapRenderSignature: "stale" })] });

    await flushBitmapRenders();
    expect(stored().bitmapRenderWarnings).toEqual(["Cut short"]);

    await rerenderBitmap("bmp-1");
    expect(stored().bitmapRenderWarnings).toBeUndefined();
  });
});

describe("background rendering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders a settings change made while no panel is showing the import", async () => {
    useCanvasStore.setState({ imports: [renderedImport()] });

    useCanvasStore.getState().updateImport("bmp-1", { bitmapRendererSettings: { spacingMM: 9 } });
    expect(statusOf()).toBe("pending");
    await vi.advanceTimersByTimeAsync(500);

    expect(materialize).toHaveBeenCalledTimes(1);
    expect(stored().bitmapRenderSignature).toBe(bitmapRenderSignature(stored()));
  });

  it("drops a pending render when the settings return to what was last rendered", async () => {
    useCanvasStore.setState({ imports: [renderedImport()] });
    const rendered = stored();

    useCanvasStore.getState().updateImport("bmp-1", { bitmapRendererSettings: { spacingMM: 9 } });
    // e.g. undo, restoring the previous settings along with their output.
    useCanvasStore.setState({ imports: [rendered] });
    await vi.advanceTimersByTimeAsync(500);

    expect(materialize).not.toHaveBeenCalled();
    expect(statusOf()).toBe("idle");
  });

  it("aborts a render already in flight once newer settings supersede it", async () => {
    materialize.mockReturnValue(new Promise(() => {}));
    useCanvasStore.setState({ imports: [renderedImport()] });

    useCanvasStore.getState().updateImport("bmp-1", { bitmapRendererSettings: { spacingMM: 9 } });
    await vi.advanceTimersByTimeAsync(500);
    const { signal } = materialize.mock.calls[0][1]!;
    expect(signal!.aborted).toBe(false);

    useCanvasStore.getState().updateImport("bmp-1", { bitmapRendererSettings: { spacingMM: 10 } });

    expect(signal!.aborted).toBe(true);
  });

  it("starts each settled change straight away, cancelling a render it supersedes", async () => {
    // A slow render: still running when the next change settles.
    materialize.mockReturnValue(new Promise(() => {}));
    useCanvasStore.setState({ imports: [renderedImport()] });

    useCanvasStore.getState().updateImport("bmp-1", { bitmapRendererSettings: { spacingMM: 9 } });
    await vi.advanceTimersByTimeAsync(RENDER_DEBOUNCE_MS + 10);
    useCanvasStore.getState().updateImport("bmp-1", { bitmapRendererSettings: { spacingMM: 10 } });
    await vi.advanceTimersByTimeAsync(RENDER_DEBOUNCE_MS + 10);

    expect(materialize).toHaveBeenCalledTimes(2);
    expect(materialize.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(materialize.mock.calls[1][1]!.signal!.aborted).toBe(false);
  });

  it("drops a pending render when its import is removed", async () => {
    useCanvasStore.setState({ imports: [bitmapImport({ bitmapRenderSignature: "stale" })] });

    useCanvasStore.setState({ imports: [] });
    await vi.advanceTimersByTimeAsync(500);

    expect(materialize).not.toHaveBeenCalled();
    expect(useBitmapRenderStatusStore.getState().entries).toEqual({});
  });

  it("does not retry a failed render on its own, but does once the installed plugins change", async () => {
    materialize.mockRejectedValueOnce(new Error("not installed"));
    useCanvasStore.setState({ imports: [bitmapImport({ bitmapRenderSignature: "stale" })] });

    await vi.advanceTimersByTimeAsync(500);
    expect(statusOf()).toBe("error");

    // An unrelated document change must not hammer the failing renderer.
    useCanvasStore.getState().updateImport("bmp-1", { name: "renamed" });
    await vi.advanceTimersByTimeAsync(500);
    expect(materialize).toHaveBeenCalledTimes(1);

    useBitmapPluginStore.setState({ plugins: [{ id: "late-plugin" } as BitmapPluginManifest] });
    await vi.advanceTimersByTimeAsync(500);
    expect(materialize).toHaveBeenCalledTimes(2);
    expect(stored().bitmapRendererPath).toBe("M1 1");
  });
});
