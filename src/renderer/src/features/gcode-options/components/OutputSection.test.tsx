import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutputSection } from "./OutputSection";
import { DEFAULT_GCODE_PREFS } from "../gcodePrefs";

describe("OutputSection", () => {
  it("shows connection/group warnings and forwards toggles", () => {
    const onToggleOpen = vi.fn();
    const onTogglePref = vi.fn();

    render(
      <OutputSection
        open
        connected={false}
        layerGroupCount={0}
        colorGroupCount={0}
        prefs={{
          ...DEFAULT_GCODE_PREFS,
          exportPerGroup: true,
          exportPerColor: true,
        }}
        onToggleOpen={onToggleOpen}
        onTogglePref={onTogglePref}
      />,
    );

    expect(screen.getByText("(not connected — will be skipped)")).toBeDefined();
    expect(screen.getByText(/No groups defined/i)).toBeDefined();
    expect(screen.getByText(/No fill colours detected/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Output" }));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("checkbox", { name: "Save to computer" }));
    expect(onTogglePref).toHaveBeenCalledWith("saveLocally");
  });
});
