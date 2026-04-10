import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DimensionInputField } from "./DimensionInputField";

describe("DimensionInputField", () => {
  it("renders label/value and forwards numeric changes", () => {
    const onChange = vi.fn();

    render(
      <DimensionInputField label="W (mm)" value={12.5} onChange={onChange} />,
    );

    expect(screen.getByText("W (mm)")).toBeTruthy();
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input.value).toBe("12.5");

    fireEvent.change(input, { target: { value: "20" } });
    expect(onChange).toHaveBeenCalledWith(20);
  });
});
