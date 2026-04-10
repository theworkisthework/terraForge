import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PositionFieldsRow } from "./PositionFieldsRow";

describe("PositionFieldsRow", () => {
  it("renders X and Y fields and forwards changes", () => {
    const onChangeX = vi.fn();
    const onChangeY = vi.fn();

    render(
      <PositionFieldsRow
        x={10}
        y={20}
        onChangeX={onChangeX}
        onChangeY={onChangeY}
      />,
    );

    expect(screen.getByText("X (mm)")).toBeTruthy();
    expect(screen.getByText("Y (mm)")).toBeTruthy();

    const spinbuttons = screen.getAllByRole("spinbutton");
    fireEvent.change(spinbuttons[0], { target: { value: "15" } });
    fireEvent.change(spinbuttons[1], { target: { value: "25" } });

    expect(onChangeX).toHaveBeenCalledWith(15);
    expect(onChangeY).toHaveBeenCalledWith(25);
  });
});
