import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RendererFieldControl } from "./RendererFieldControl";
import type { BitmapRendererNumberFieldSchema } from "../../bitmap-renderers/types";

/**
 * A collaborator reported a slider's right edge drawing off the panel. The
 * cause: a plain `flex-1` range input's automatic minimum size is its
 * intrinsic content width, which does not shrink in a narrow column —
 * exactly the failure StrokeWidthSection's own slider already works around
 * with `min-w-0`. jsdom does not lay out real pixels, so this pins the CSS
 * mechanism (min-w-0 on the row and the input) rather than measured overflow.
 */
describe("RendererFieldControl slider", () => {
  const field: BitmapRendererNumberFieldSchema = {
    type: "number",
    key: "amplitudeMM",
    label: "Wave height (mm)",
    ariaLabel: "Wave height",
    control: "slider",
    min: 0,
    max: 6,
    step: 0.1,
  };

  it("lets the slider shrink instead of overflowing its column", () => {
    render(<RendererFieldControl field={field} value={1.2} onChange={vi.fn()} />);

    const slider = screen.getByLabelText("Wave height");
    expect(slider).toHaveClass("min-w-0", "flex-1");
    expect(slider.parentElement).toHaveClass("min-w-0", "flex");
  });

  it("still lets the slider shrink with a preset button sharing the row", () => {
    render(
      <RendererFieldControl
        field={{ ...field, presets: [{ label: "Reset", delta: -1.2, icon: "rotate-ccw" }] }}
        value={1.2}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Wave height")).toHaveClass("min-w-0", "flex-1");
  });
});
