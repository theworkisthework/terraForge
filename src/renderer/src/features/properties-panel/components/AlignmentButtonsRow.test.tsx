import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AlignmentButtonsRow } from "./AlignmentButtonsRow";

describe("AlignmentButtonsRow", () => {
  it("forwards all alignment actions", () => {
    const onAlignLeft = vi.fn();
    const onAlignCenterX = vi.fn();
    const onAlignRight = vi.fn();
    const onAlignTop = vi.fn();
    const onAlignCenterY = vi.fn();
    const onAlignBottom = vi.fn();

    render(
      <AlignmentButtonsRow
        leftTitle="Left"
        centerHTitle="Center X"
        rightTitle="Right"
        topTitle="Top"
        centerVTitle="Center Y"
        bottomTitle="Bottom"
        onAlignLeft={onAlignLeft}
        onAlignCenterX={onAlignCenterX}
        onAlignRight={onAlignRight}
        onAlignTop={onAlignTop}
        onAlignCenterY={onAlignCenterY}
        onAlignBottom={onAlignBottom}
      />,
    );

    fireEvent.click(screen.getByTitle("Left"));
    fireEvent.click(screen.getByTitle("Center X"));
    fireEvent.click(screen.getByTitle("Right"));
    fireEvent.click(screen.getByTitle("Top"));
    fireEvent.click(screen.getByTitle("Center Y"));
    fireEvent.click(screen.getByTitle("Bottom"));

    expect(onAlignLeft).toHaveBeenCalledTimes(1);
    expect(onAlignCenterX).toHaveBeenCalledTimes(1);
    expect(onAlignRight).toHaveBeenCalledTimes(1);
    expect(onAlignTop).toHaveBeenCalledTimes(1);
    expect(onAlignCenterY).toHaveBeenCalledTimes(1);
    expect(onAlignBottom).toHaveBeenCalledTimes(1);
  });
});
