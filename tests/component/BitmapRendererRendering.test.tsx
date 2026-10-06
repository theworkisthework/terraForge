import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BitmapRendererSection } from "@renderer/features/properties-panel/components/BitmapRendererSection";
import { useBitmapPluginStore } from "@renderer/store/bitmapPluginStore";
import type { SvgImport } from "@types/index";

vi.mock("@renderer/features/bitmap-renderers/bitmapImage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@renderer/features/bitmap-renderers/bitmapImage")>();
  return { ...actual, materializeBitmapLayers: vi.fn() };
});

import {
  bitmapRenderSignature,
  materializeBitmapLayers,
} from "@renderer/features/bitmap-renderers/bitmapImage";

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
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  useBitmapPluginStore.setState({ plugins: [], errors: [], scanning: false, actionError: null });
  materialize.mockReset();
  materialize.mockResolvedValue({ bitmapRendererPath: "M1 1", paths: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BitmapRendererSection re-render behaviour", () => {
  it("does not re-render a bitmap whose stored output matches its current settings", async () => {
    const imp = bitmapImport();
    const onUpdate = vi.fn();

    render(
      <BitmapRendererSection
        imp={{ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) }}
        onUpdate={onUpdate}
      />,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(materialize).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("renders, and records the signature, when the stored output predates the current settings", async () => {
    const imp = bitmapImport({ bitmapRenderSignature: "stale-signature" });
    const onUpdate = vi.fn();

    render(<BitmapRendererSection imp={imp} onUpdate={onUpdate} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(materialize).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      bitmapRendererPath: "M1 1",
      paths: [],
      bitmapRenderSignature: bitmapRenderSignature(imp),
    });
  });

  it("renders a bitmap that has never recorded a signature", async () => {
    const onUpdate = vi.fn();

    render(<BitmapRendererSection imp={bitmapImport()} onUpdate={onUpdate} />);
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
    const onUpdate = vi.fn();

    render(
      <BitmapRendererSection
        imp={{ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) }}
        onUpdate={onUpdate}
      />,
    );

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
    const onUpdate = vi.fn();

    render(
      <BitmapRendererSection
        imp={{ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) }}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.change(screen.getByLabelText("Bitmap renderer"), {
      target: { value: "spiral-amplitude" },
    });

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ bitmapRendererPath: undefined, paths: [] }),
    );
  });

  it("renders once for a run of rapid changes, not once per change", async () => {
    const onUpdate = vi.fn();
    const { rerender } = render(
      <BitmapRendererSection imp={bitmapImport({ bitmapRenderSignature: "stale" })} onUpdate={onUpdate} />,
    );

    // Four spinner clicks 250ms apart — comfortably slower than the old 200ms
    // debounce, which rendered on every one of them.
    for (const spacingMM of [9, 10, 11, 12]) {
      rerender(
        <BitmapRendererSection
          imp={bitmapImport({
            bitmapRenderSignature: "stale",
            bitmapRendererSettings: { spacingMM, toothWidthMM: 9, amplitude: 10 },
          })}
          onUpdate={onUpdate}
        />,
      );
      await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    }
    expect(materialize).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(materialize).toHaveBeenCalledTimes(1);
  });

  it("reports pending while waiting, then rendering once work starts", async () => {
    materialize.mockReset();
    materialize.mockReturnValue(new Promise(() => {}));

    render(
      <BitmapRendererSection
        imp={bitmapImport({ bitmapRenderSignature: "stale" })}
        onUpdate={vi.fn()}
      />,
    );

    // The change is registered but nothing has started yet.
    expect(screen.getByRole("status")).toHaveTextContent("Status: Pending");
    await act(async () => { await vi.advanceTimersByTimeAsync(399); });
    expect(screen.getByRole("status")).toHaveTextContent("Status: Pending");
    expect(materialize).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(2); });
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Status: Rendering");
  });

  it("holds the rendering label long enough to see, even for an instant render", async () => {
    const onUpdate = vi.fn();
    render(
      <BitmapRendererSection
        imp={bitmapImport({ bitmapRenderSignature: "stale" })}
        onUpdate={onUpdate}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Status: Pending");

    // A plain advance, not a stepped one: collapsing the debounce and the
    // render into a single batch is exactly what used to hide this state.
    await act(async () => { await vi.advanceTimersByTimeAsync(450); });
    expect(screen.getByRole("status")).toHaveTextContent("Status: Rendering");

    // The result is applied straight away — only the label waits.
    expect(onUpdate).toHaveBeenCalledTimes(1);

    // Still held well after the render itself finished.
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(screen.getByRole("status")).toHaveTextContent("Status: Rendering");

    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.getByRole("status")).toHaveTextContent("Status: Ready");
  });

  it("names the resting state rather than leaving it blank", () => {
    const imp = bitmapImport();

    render(
      <BitmapRendererSection
        imp={{ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) }}
        onUpdate={vi.fn()}
      />,
    );

    // A blank label is indistinguishable from "no status available", so a
    // settled renderer has to say so.
    expect(screen.getByRole("status")).toHaveTextContent("Status: Ready");
  });

  it("reports a failure in the status line as well as in full below", async () => {
    materialize.mockReset();
    materialize.mockRejectedValue(new Error("boom"));

    render(
      <BitmapRendererSection
        imp={bitmapImport({ bitmapRenderSignature: "stale" })}
        onUpdate={vi.fn()}
      />,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });

    expect(screen.getByRole("status")).toHaveTextContent("Status: Failed");
    expect(screen.getByText(/Render failed: boom/)).toBeInTheDocument();
  });

  it("stays pending, never claiming to render, across a run of rapid changes", async () => {
    const { rerender } = render(
      <BitmapRendererSection imp={bitmapImport({ bitmapRenderSignature: "stale" })} onUpdate={vi.fn()} />,
    );

    for (const spacingMM of [9, 10, 11]) {
      rerender(
        <BitmapRendererSection
          imp={bitmapImport({
            bitmapRenderSignature: "stale",
            bitmapRendererSettings: { spacingMM, toothWidthMM: 9, amplitude: 10 },
          })}
          onUpdate={vi.fn()}
        />,
      );
      await act(async () => { await vi.advanceTimersByTimeAsync(250); });
      expect(screen.getByRole("status")).toHaveTextContent("Status: Pending");
    }
    expect(materialize).not.toHaveBeenCalled();
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

      const idle = render(
        <BitmapRendererSection
          imp={{ ...imp, bitmapRenderSignature: bitmapRenderSignature(imp) }}
          onUpdate={vi.fn()}
        />,
      );
      const idlePosition = controlsPosition();
      expect(screen.getByRole("status")).toHaveTextContent("Status: Ready");
      idle.unmount();

      // Hold the render open so the "rendering" state can be observed.
      materialize.mockReset();
      materialize.mockReturnValue(new Promise(() => {}));

      render(
        <BitmapRendererSection
          imp={bitmapImport({ bitmapRenderSignature: "stale" })}
          onUpdate={vi.fn()}
        />,
      );
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });

      expect(screen.getByRole("status")).toHaveTextContent("Status: Rendering");
      expect(controlsPosition()).toBe(idlePosition);
    });

    it("reports a render failure below the controls, never above them", async () => {
      materialize.mockReset();
      materialize.mockRejectedValue(new Error("boom"));

      render(
        <BitmapRendererSection
          imp={bitmapImport({ bitmapRenderSignature: "stale" })}
          onUpdate={vi.fn()}
        />,
      );
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });

      const grid = screen.getByLabelText("Spiral spacing").closest("div.grid")!;
      const section = grid.parentElement!;
      const failure = screen.getByText(/Render failed: boom/);

      const children = Array.from(section.children);
      expect(children.indexOf(failure)).toBeGreaterThan(children.indexOf(grid));
    });
  });
});
