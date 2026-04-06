import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StrokeWidthSection } from "./StrokeWidthSection";

describe("StrokeWidthSection", () => {
  it("uses default stroke width when unset", () => {
    render(
      <StrokeWidthSection
        strokeWidthMM={undefined}
        defaultStrokeWidthMM={0.5}
        onChangeStrokeWidth={() => {}}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Stroke width" });
    expect(slider).toHaveValue("0.5");
  });

  it("forwards slider and number changes", () => {
    const onChangeStrokeWidth = vi.fn();

    render(
      <StrokeWidthSection
        strokeWidthMM={1}
        defaultStrokeWidthMM={0.5}
        onChangeStrokeWidth={onChangeStrokeWidth}
      />,
    );

    fireEvent.change(screen.getByRole("slider", { name: "Stroke width" }), {
      target: { value: "2.4" },
    });
    expect(onChangeStrokeWidth).toHaveBeenCalledWith(2.4);

    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Stroke width value" }),
      { target: { value: "3.1" } },
    );
    expect(onChangeStrokeWidth).toHaveBeenCalledWith(3.1);
  });
});
