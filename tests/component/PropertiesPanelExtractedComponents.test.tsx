import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolpathSection } from "../../src/renderer/src/features/properties-panel/components/ToolpathSection";
import { LayersHeader } from "../../src/renderer/src/features/properties-panel/components/LayersHeader";
import { NumberField } from "../../src/renderer/src/features/properties-panel/components/NumberField";
import type { GcodeToolpath } from "../../src/renderer/src/utils/gcodeParser";

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

describe("Properties panel extracted components", () => {
  it("ToolpathSection forwards toggle and clear actions", () => {
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

  it("ToolpathSection hides feedrate row when feedrate is zero", () => {
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

  it("LayersHeader renders only when show=true and triggers add action", () => {
    const onAddGroup = vi.fn();
    const { rerender } = render(
      <LayersHeader show={false} onAddGroup={onAddGroup} />,
    );

    expect(screen.queryByText("Layers")).toBeNull();

    rerender(<LayersHeader show onAddGroup={onAddGroup} />);
    expect(screen.getByText("Layers")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(onAddGroup).toHaveBeenCalledTimes(1);
  });

  it("NumberField renders and emits parsed numeric changes", () => {
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
