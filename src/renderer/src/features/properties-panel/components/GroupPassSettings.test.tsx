import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GroupPassSettings } from "./GroupPassSettings";

describe("GroupPassSettings", () => {
  it("renders label, pass count, and pass mode", () => {
    render(
      <GroupPassSettings
        label="Layer"
        passCount={2}
        passMode="repeat"
        onPassCountChange={() => {}}
        onPassModeChange={() => {}}
      />,
    );

    expect(screen.getByText("Layer pass settings")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Repeat")).toBeInTheDocument();
  });

  it("clamps pass count and forwards pass mode changes", () => {
    const onPassCountChange = vi.fn();
    const onPassModeChange = vi.fn();

    render(
      <GroupPassSettings
        label="Colour"
        passCount={1}
        passMode="repeat"
        onPassCountChange={onPassCountChange}
        onPassModeChange={onPassModeChange}
      />,
    );

    const countInput = screen.getByTitle(
      "Number of times to repeat all paths in this group",
    );
    fireEvent.change(countInput, { target: { value: "0" } });
    expect(onPassCountChange).toHaveBeenCalledWith(1);

    fireEvent.change(countInput, { target: { value: "120" } });
    expect(onPassCountChange).toHaveBeenCalledWith(99);

    const modeSelect = screen.getByTitle("Pass behavior for this group");
    fireEvent.change(modeSelect, { target: { value: "backtrack" } });
    expect(onPassModeChange).toHaveBeenCalledWith("backtrack");
  });
});
