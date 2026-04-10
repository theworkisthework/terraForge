import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PathsSection } from "./PathsSection";
import { DEFAULT_GCODE_PREFS } from "../gcodePrefs";

describe("PathsSection", () => {
  it("toggles path options and forwards tolerance input", () => {
    const onToggleOpen = vi.fn();
    const onTogglePref = vi.fn();
    const onJoinToleranceChange = vi.fn();

    render(
      <PathsSection
        open
        prefs={DEFAULT_GCODE_PREFS}
        onToggleOpen={onToggleOpen}
        onTogglePref={onTogglePref}
        onJoinToleranceChange={onJoinToleranceChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Paths" }));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("checkbox", { name: "Optimise paths" }));
    expect(onTogglePref).toHaveBeenCalledWith("optimise");

    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "0.75" },
    });
    expect(onJoinToleranceChange).toHaveBeenCalledWith("0.75");
  });
});
