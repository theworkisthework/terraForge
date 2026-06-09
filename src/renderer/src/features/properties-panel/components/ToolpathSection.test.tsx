import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolpathSection } from "./ToolpathSection";
import type { GcodeToolpath } from "../../../utils/gcodeParser";

function buildToolpath(patch: Partial<GcodeToolpath> = {}): GcodeToolpath {
  return {
    cutPaths: [],
    rapidPaths: new Float32Array(),
    bounds: { minX: 0, maxX: 20, minY: 0, maxY: 10 },
    lineCount: 123,
    fileSizeBytes: 2400,
    totalCutDistance: 120,
    totalRapidDistance: 30,
    feedrate: 600,
    ...patch,
  };
}

describe("ToolpathSection", () => {
  it("forwards toggle and clear actions", () => {
    const onToggleSelected = vi.fn();
    const onClear = vi.fn();

    render(
      <ToolpathSection
        toolpath={buildToolpath()}
        fileName="sample.gcode"
        selected
        visible
        colorized
        opacity={1}
        isJobActive={false}
        fallbackFeedrate={300}
        onToggleSelected={onToggleSelected}
        onSetVisible={() => {}}
        onSetColorized={() => {}}
        onSetOpacity={() => {}}
        onClear={onClear}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Collapse toolpath details/i }),
    );
    expect(onToggleSelected).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(onClear).toHaveBeenCalledTimes(1);

    expect(screen.getByText("sample.gcode")).toBeDefined();
    expect(screen.getByText("Size")).toBeDefined();
    expect(screen.getByText("Lines")).toBeDefined();
    expect(screen.getByText("Est. duration")).toBeDefined();
  });

  it("hides feedrate row when feedrate is zero", () => {
    render(
      <ToolpathSection
        toolpath={buildToolpath({ feedrate: 0 })}
        fileName="nofeed.gcode"
        selected
        visible
        colorized
        opacity={1}
        isJobActive={false}
        fallbackFeedrate={300}
        onToggleSelected={() => {}}
        onSetVisible={() => {}}
        onSetColorized={() => {}}
        onSetOpacity={() => {}}
        onClear={() => {}}
      />,
    );

    expect(screen.queryByText("Feedrate")).toBeNull();
  });

  it("forwards visibility and opacity controls", () => {
    const onSetVisible = vi.fn();
    const onSetColorized = vi.fn();
    const onSetOpacity = vi.fn();

    render(
      <ToolpathSection
        toolpath={buildToolpath()}
        fileName="sample.gcode"
        selected
        visible
        colorized
        opacity={0.75}
        isJobActive={false}
        fallbackFeedrate={300}
        onToggleSelected={() => {}}
        onSetVisible={onSetVisible}
        onSetColorized={onSetColorized}
        onSetOpacity={onSetOpacity}
        onClear={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Hide toolpath/i }));
    expect(onSetVisible).toHaveBeenCalledWith(false);

    fireEvent.change(screen.getByLabelText("Toolpath opacity"), {
      target: { value: "40" },
    });
    expect(onSetOpacity).toHaveBeenCalledWith(0.4);

    fireEvent.click(
      screen.getByRole("button", { name: /Disable colorized toolpath/i }),
    );
    expect(onSetColorized).toHaveBeenCalledWith(false);
  });
});
