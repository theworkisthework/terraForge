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
        isJobActive={false}
        fallbackFeedrate={300}
        onToggleSelected={onToggleSelected}
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
        isJobActive={false}
        fallbackFeedrate={300}
        onToggleSelected={() => {}}
        onClear={() => {}}
      />,
    );

    expect(screen.queryByText("Feedrate")).toBeNull();
  });
});
