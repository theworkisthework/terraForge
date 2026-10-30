import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BitmapRendererSection } from "@renderer/features/properties-panel/components/BitmapRendererSection";
import { useRendererPluginStore } from "@renderer/store/rendererPluginStore";
import { useCanvasStore } from "@renderer/store/canvasStore";
import {
  MIN_RENDERING_VISIBLE_MS,
  RENDER_DEBOUNCE_MS,
  startBitmapRenderService,
} from "@renderer/features/bitmap-renderers/bitmapRenderService";
import type { RendererPluginManifest, SvgImport } from "../../src/types";

vi.mock("@renderer/features/bitmap-renderers/bitmapImage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@renderer/features/bitmap-renderers/bitmapImage")>();
  return { ...actual, materializeBitmapLayers: vi.fn() };
});

import {
  bitmapRendererStamp,
  bitmapRenderSignature,
  materializeBitmapLayers,
} from "@renderer/features/bitmap-renderers/bitmapImage";
import { spiralAmplitudeRenderer } from "@renderer/features/bitmap-renderers/spiralAmplitude";

/** What the current spiral renderer stamps on its output. */
const currentVersion = bitmapRendererStamp(spiralAmplitudeRenderer);

const materialize = vi.mocked(materializeBitmapLayers);

let stopService: () => void = () => {};

/** Seeds the document with `imp` and renders the panel against the live store. */
function renderPanel(imp: SvgImport, onUpdate = vi.fn()) {
  useCanvasStore.setState({ imports: [imp] });
  function Panel() {
    const current = useCanvasStore((state) => state.imports.find((item) => item.id === imp.id))!;
    return (
      <BitmapRendererSection
        imp={current}
        onUpdate={(changes) => {
          onUpdate(changes);
          useCanvasStore.getState().updateImport(imp.id, changes);
        }}
      />
    );
  }
  const result = render(<Panel />);
  return { ...result, onUpdate };
}

/** Replaces the import in the document, as an edit from anywhere would. */
function replaceImport(imp: SvgImport) {
  act(() => {
    useCanvasStore.setState({ imports: [imp] });
  });
}

const storedImport = () => useCanvasStore.getState().imports[0];

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
    hatchEnabled: false,
    hatchSpacingMM: 1,
    hatchAngleDeg: 45,
    strokeEnabled: true,
    generatedStrokeForNoStroke: false,
    bitmapDataUrl: "data:image/png;base64,AAAA",
    bitmapRendererId: "spiral-amplitude",
    bitmapRendererSettings: { spacingMM: 8, toothWidthMM: 9, amplitude: 10 },
    bitmapBaseScale: 0.264,
    bitmapRendererPath: "M0 0",
    bitmapRendererVersion: currentVersion,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  useRendererPluginStore.setState({ plugins: [], errors: [], scanning: false, actionError: null });
  materialize.mockReset();
  materialize.mockResolvedValue({ bitmapRendererPath: "M1 1", paths: [], rendererVersion: currentVersion });
  useCanvasStore.setState({ imports: [] });
  stopService = startBitmapRenderService();
});

afterEach(() => {
  act(() => stopService());
  vi.useRealTimers();
});

describe("BitmapRendererSection re-render behaviour", () => {
  it("does not re-render a bitmap whose stored output matches its current settings", async () => {
    const imp = bitmapImport();
    const { onUpdate } = renderPanel({ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(materialize).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("renders, and records the signature, when the stored output predates the current settings", async () => {
    const imp = bitmapImport({ bitmapRenderSignature: "stale-signature" });
    renderPanel(imp);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(materialize).toHaveBeenCalledTimes(1);
    expect(storedImport()).toMatchObject({
      bitmapRendererPath: "M1 1",
      paths: [],
      bitmapRenderSignature: bitmapRenderSignature(imp),
    });
  });

  it("renders a bitmap that has never recorded a signature", async () => {
    renderPanel(bitmapImport());
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(materialize).toHaveBeenCalledTimes(1);
  });

  it("treats a settings bag rebuilt in a different key order as unchanged", () => {
    const imp = bitmapImport({ bitmapRendererSettings: { spacingMM: 8, toothWidthMM: 9, amplitude: 10 } });
    const reordered = bitmapImport({
      bitmapRendererSettings: { amplitude: 10, spacingMM: 8, toothWidthMM: 9 },
    });

    expect(bitmapRenderSignature(reordered)).toBe(bitmapRenderSignature(imp));
  });

  it("keeps the existing preview on screen while a settings change re-renders", async () => {
    const imp = bitmapImport();
    const { onUpdate } = renderPanel({ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) });

    fireEvent.change(screen.getByLabelText("Spiral spacing"), { target: { value: "9" } });

    // Only the settings change — blanking bitmapRendererPath/paths here is what
    // made the preview flicker away on every spinner click.
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const patch = onUpdate.mock.calls[0][0];
    expect(patch.bitmapRendererSettings).toMatchObject({ spacingMM: 9 });
    expect(patch).not.toHaveProperty("bitmapRendererPath");
    expect(patch).not.toHaveProperty("paths");
  });

  it("still clears the preview when the renderer itself is switched", () => {
    const imp = bitmapImport();
    const { onUpdate } = renderPanel({ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) });

    fireEvent.change(screen.getByLabelText("Bitmap renderer"), {
      target: { value: "spiral-amplitude" },
    });

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ bitmapRendererPath: undefined, paths: [] }),
    );
  });

  it("renders once for a run of rapid changes, not once per change", async () => {
    renderPanel(bitmapImport({ bitmapRenderSignature: "stale" }));

    // Four changes, each arriving before the previous one has settled.
    for (const spacingMM of [9, 10, 11, 12]) {
      replaceImport(
        bitmapImport({
          bitmapRenderSignature: "stale",
          bitmapRendererSettings: { spacingMM, toothWidthMM: 9, amplitude: 10 },
        }),
      );
      await act(async () => { await vi.advanceTimersByTimeAsync(RENDER_DEBOUNCE_MS - 50); });
    }
    expect(materialize).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(RENDER_DEBOUNCE_MS); });
    expect(materialize).toHaveBeenCalledTimes(1);
  });

  it("reports pending while waiting, then rendering once work starts", async () => {
    materialize.mockReset();
    materialize.mockReturnValue(new Promise(() => {}));

    renderPanel(bitmapImport({ bitmapRenderSignature: "stale" }));

    // The change is registered but nothing has started yet.
    expect(screen.getByRole("status")).toHaveTextContent("Status: Pending");
    await act(async () => { await vi.advanceTimersByTimeAsync(RENDER_DEBOUNCE_MS - 1); });
    expect(screen.getByRole("status")).toHaveTextContent("Status: Pending");
    expect(materialize).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(2); });
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Status: Rendering");
  });

  it("holds the rendering label long enough to see, even for an instant render", async () => {
    renderPanel(bitmapImport({ bitmapRenderSignature: "stale" }));
    expect(screen.getByRole("status")).toHaveTextContent("Status: Pending");

    // A plain advance, not a stepped one: collapsing the debounce and the
    // render into a single batch is exactly what used to hide this state.
    await act(async () => { await vi.advanceTimersByTimeAsync(RENDER_DEBOUNCE_MS + 50); });
    expect(screen.getByRole("status")).toHaveTextContent("Status: Rendering");

    // The result is applied straight away — only the label waits.
    expect(storedImport().bitmapRendererPath).toBe("M1 1");

    // Still held well after the render itself finished.
    await act(async () => { await vi.advanceTimersByTimeAsync(MIN_RENDERING_VISIBLE_MS - 150); });
    expect(screen.getByRole("status")).toHaveTextContent("Status: Rendering");

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByRole("status")).toHaveTextContent("Status: Ready");
  });

  it("names the resting state rather than leaving it blank", () => {
    const imp = bitmapImport();
    renderPanel({ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) });

    // A blank label is indistinguishable from "no status available", so a
    // settled renderer has to say so.
    expect(screen.getByRole("status")).toHaveTextContent("Status: Ready");
  });

  it("reports a failure in the status line as well as in full below", async () => {
    materialize.mockReset();
    materialize.mockRejectedValue(new Error("boom"));

    renderPanel(bitmapImport({ bitmapRenderSignature: "stale" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });

    expect(screen.getByRole("status")).toHaveTextContent("Status: Failed");
    expect(screen.getByText(/Render failed: boom/)).toBeInTheDocument();
  });

  it("stays pending, never claiming to render, across a run of rapid changes", async () => {
    renderPanel(bitmapImport({ bitmapRenderSignature: "stale" }));

    for (const spacingMM of [9, 10, 11]) {
      replaceImport(
        bitmapImport({
          bitmapRenderSignature: "stale",
          bitmapRendererSettings: { spacingMM, toothWidthMM: 9, amplitude: 10 },
        }),
      );
      await act(async () => { await vi.advanceTimersByTimeAsync(RENDER_DEBOUNCE_MS - 50); });
      expect(screen.getByRole("status")).toHaveTextContent("Status: Pending");
    }
    expect(materialize).not.toHaveBeenCalled();
  });

  it("still renders a change when the panel closes before the render lands", async () => {
    const imp = bitmapImport();
    const { unmount } = renderPanel({ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) });

    fireEvent.change(screen.getByLabelText("Spiral spacing"), { target: { value: "9" } });
    // Deselecting the import unmounts the panel inside the debounce window.
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(materialize).toHaveBeenCalledTimes(1);
    expect(storedImport().bitmapRendererPath).toBe("M1 1");
    expect(storedImport().bitmapRenderSignature).toBe(bitmapRenderSignature(storedImport()));
  });

  it("shows the renderer's warnings about the current output below the controls", () => {
    const imp = bitmapImport({ bitmapRenderWarnings: ["Output was cut short at the point limit."] });
    renderPanel({ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) });

    const warning = screen.getByText("Output was cut short at the point limit.");
    const grid = screen.getByLabelText("Spiral spacing").closest("div.grid")!;
    const children = Array.from(grid.parentElement!.children);
    expect(children.indexOf(warning)).toBeGreaterThan(children.indexOf(grid));
  });

  it("offers bitmap-capable plugins, but not generators or ids clashing with a built-in", () => {
    const manifest = (id: string, source?: "required" | "optional" | "none") =>
      ({ id, label: id, apiVersion: 1, defaults: {}, fields: [], source }) as RendererPluginManifest;
    useRendererPluginStore.setState({
      plugins: [
        manifest("acme.tracer", "required"),
        manifest("acme.hybrid", "optional"),
        manifest("acme.spirograph", "none"),
        manifest("spiral-amplitude", "required"),
      ],
    });
    const imp = bitmapImport();
    renderPanel({ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) });

    const options = Array.from(screen.getByLabelText("Bitmap renderer").querySelectorAll("option")).map((o) => o.value);
    expect(options).toContain("acme.tracer");
    expect(options).toContain("acme.hybrid");
    expect(options).not.toContain("acme.spirograph");
    expect(options.filter((value) => value === "spiral-amplitude")).toHaveLength(1);
  });

  describe("tone", () => {
    it("shows tone controls for every renderer, from the shared pipeline", () => {
      const imp = bitmapImport({ bitmapRendererId: "dot-halftone", bitmapRendererSettings: {} });
      renderPanel({ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) });

      expect(screen.getByLabelText("Auto levels")).toBeInTheDocument();
      expect(screen.getByLabelText("Contrast")).toBeInTheDocument();
      expect(screen.getByLabelText("Smoothing (mm)")).toBeInTheDocument();
    });

    it("stores an edit as explicit tone, carrying an older drawing's settings over", async () => {
      const imp = bitmapImport({ bitmapRendererSettings: { spacingMM: 8, toothWidthMM: 9, amplitude: 10, autoLevels: true } });
      renderPanel({ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) });
      expect(screen.getByLabelText("Auto levels")).toBeChecked();

      fireEvent.change(screen.getByLabelText("Contrast"), { target: { value: "2" } });

      expect(storedImport().bitmapTone).toEqual({ autoLevels: true, contrast: 2, smoothingMM: 0.5 });
      // A tone change is a settings change: it re-renders like any other.
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      expect(materialize).toHaveBeenCalledTimes(1);
    });
  });

  describe("output from an older renderer version", () => {
    /** Settings unchanged since the render, but made by an older renderer. */
    function oldRender() {
      const imp = bitmapImport({ bitmapRendererVersion: "1/spiral-amplitude@tone-spine-1.1" });
      return { ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) };
    }

    it("offers a re-render instead of silently replacing what the user has seen", async () => {
      renderPanel(oldRender());
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

      expect(materialize).not.toHaveBeenCalled();
      expect(storedImport().bitmapRendererPath).toBe("M0 0");
      expect(screen.getByRole("status")).toHaveTextContent("Status: Renderer updated");
      expect(screen.getByRole("button", { name: "Re-render" })).toBeInTheDocument();
    });

    it("re-renders on request and records the current renderer version", async () => {
      renderPanel(oldRender());

      fireEvent.click(screen.getByRole("button", { name: "Re-render" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

      expect(materialize).toHaveBeenCalledTimes(1);
      expect(storedImport()).toMatchObject({ bitmapRendererPath: "M1 1", bitmapRendererVersion: currentVersion });
      expect(screen.queryByRole("button", { name: "Re-render" })).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Status: Ready");
    });

    it("re-renders automatically, picking up the new version, once a setting changes", async () => {
      renderPanel(oldRender());

      fireEvent.change(screen.getByLabelText("Spiral spacing"), { target: { value: "9" } });
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });

      expect(materialize).toHaveBeenCalledTimes(1);
      expect(storedImport().bitmapRendererVersion).toBe(currentVersion);
    });
  });

  /**
   * The controls must not move as render state changes. Transient status text
   * inserted above them used to push a number spinner out from under the
   * user's cursor mid-click, then drop it back when the render finished.
   */
  describe("layout stability", () => {
    const controlsPosition = () => {
      const grid = screen.getByLabelText("Spiral spacing").closest("div.grid")!;
      const section = grid.parentElement!;
      return Array.from(section.children).indexOf(grid);
    };

    it("leaves the controls in the same place whether or not a render is in flight", async () => {
      const imp = bitmapImport();

      const idle = renderPanel({ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) });
      const idlePosition = controlsPosition();
      expect(screen.getByRole("status")).toHaveTextContent("Status: Ready");
      idle.unmount();

      // Hold the render open so the "rendering" state can be observed.
      materialize.mockReset();
      materialize.mockReturnValue(new Promise(() => {}));

      renderPanel(bitmapImport({ bitmapRenderSignature: "stale" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });

      expect(screen.getByRole("status")).toHaveTextContent("Status: Rendering");
      expect(controlsPosition()).toBe(idlePosition);
    });

    it("reports a render failure below the controls, never above them", async () => {
      materialize.mockReset();
      materialize.mockRejectedValue(new Error("boom"));

      renderPanel(bitmapImport({ bitmapRenderSignature: "stale" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });

      const grid = screen.getByLabelText("Spiral spacing").closest("div.grid")!;
      const section = grid.parentElement!;
      const failure = screen.getByText(/Render failed: boom/);

      const children = Array.from(section.children);
      expect(children.indexOf(failure)).toBeGreaterThan(children.indexOf(grid));
    });
  });
});
