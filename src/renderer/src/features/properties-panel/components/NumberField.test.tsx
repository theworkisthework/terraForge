import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumberField } from "./NumberField";

describe("NumberField", () => {
  it("renders and emits parsed numeric changes", () => {
    const onChange = vi.fn();

    render(
      <NumberField
        label="X (mm)"
        value={12.5}
        onChange={onChange}
        step={0.5}
      />,
    );

    const input = screen.getByLabelText("X (mm)");
    fireEvent.change(input, { target: { value: "15.25" } });

    expect(onChange).toHaveBeenCalledWith(15.25);
  });
});
