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
        sourceLayerCount={0}
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
    expect(
      screen.getByRole("checkbox", {
        name: "Split output into separate files",
      }),
    ).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Output" }));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("checkbox", { name: "Save to computer" }));
    expect(onTogglePref).toHaveBeenCalledWith("saveLocally");
  });

  it("shows the per-layer warning when no source layers are detected", () => {
    render(
      <OutputSection
        open
        connected={true}
        sourceLayerCount={0}
        layerGroupCount={0}
        colorGroupCount={0}
        prefs={{
          ...DEFAULT_GCODE_PREFS,
          exportPerLayer: true,
        }}
        onToggleOpen={vi.fn()}
        onTogglePref={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("radio", { name: "Export one file per SVG layer" }),
    ).toBeChecked();
    expect(screen.getByText(/No source layers detected/i)).toBeInTheDocument();
  });
});
