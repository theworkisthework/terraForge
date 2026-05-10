import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PathPassSettings } from "./PathPassSettings";

describe("PathPassSettings", () => {
  it("renders defaults when pass props are omitted", () => {
    render(
      <PathPassSettings
        pathId="p1"
        pathLabel="path p1"
        onUpdatePath={() => {}}
      />,
    );

    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Repeat")).toBeInTheDocument();
  });

  it("forwards updates with path id and clamped values", () => {
    const onUpdatePath = vi.fn();

    render(
      <PathPassSettings
        pathId="p42"
        pathLabel="path p42"
        passCount={3}
        passMode="repeat"
        onUpdatePath={onUpdatePath}
        indented
      />,
    );

    const countInput = screen.getByTitle("Number of times to repeat this path");
    fireEvent.change(countInput, { target: { value: "0" } });
    expect(onUpdatePath).toHaveBeenCalledWith("p42", { passCount: 1 });

    fireEvent.change(countInput, { target: { value: "130" } });
    expect(onUpdatePath).toHaveBeenCalledWith("p42", { passCount: 99 });

    const modeSelect = screen.getByTitle(
      "How to handle multiple passes: repeat (draw same), backtrack (forward then reverse), or penLift (repeat with pen lift)",
    );
    fireEvent.change(modeSelect, { target: { value: "penLift" } });
    expect(onUpdatePath).toHaveBeenCalledWith("p42", { passMode: "penLift" });
  });
});
