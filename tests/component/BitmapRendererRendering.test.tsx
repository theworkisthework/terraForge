import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
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
});
