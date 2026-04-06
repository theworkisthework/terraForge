import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomGcodeSection } from "./CustomGcodeSection";
import { DEFAULT_GCODE_PREFS } from "../gcodePrefs";

describe("CustomGcodeSection", () => {
  it("toggles and emits text changes", () => {
    const onToggleOpen = vi.fn();
    const onCustomStartChange = vi.fn();
    const onCustomEndChange = vi.fn();

    render(
      <CustomGcodeSection
        open
        prefs={{
          ...DEFAULT_GCODE_PREFS,
          customStartGcode: "M3",
          customEndGcode: "M5",
        }}
        onToggleOpen={onToggleOpen}
        onCustomStartChange={onCustomStartChange}
        onCustomEndChange={onCustomEndChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Custom G-code" }));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Custom start G-code"), {
      target: { value: "G4 P0.2" },
    });
    expect(onCustomStartChange).toHaveBeenCalledWith("G4 P0.2");

    fireEvent.change(screen.getByLabelText("Custom end G-code"), {
      target: { value: "M2" },
    });
    expect(onCustomEndChange).toHaveBeenCalledWith("M2");
  });
});
