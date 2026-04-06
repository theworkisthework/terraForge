import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LayerRow } from "./LayerRow";

describe("LayerRow", () => {
  it("renders metadata and forwards visibility/expand handlers", () => {
    const onToggleExpanded = vi.fn();
    const onToggleVisible = vi.fn();

    render(
      <LayerRow
        name="Ink Layer"
        visible
        pathCount={4}
        expanded={false}
        onToggleExpanded={onToggleExpanded}
        onToggleVisible={onToggleVisible}
      />,
    );

    expect(screen.getByText("Ink Layer")).toBeDefined();
    expect(screen.getByText("4p")).toBeDefined();

    fireEvent.click(screen.getByTitle("Expand layer"));
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Toggle layer visibility"));
    expect(onToggleVisible).toHaveBeenCalledTimes(1);
  });

  it("shows collapse title when expanded", () => {
    render(
      <LayerRow
        name="Expanded"
        visible={false}
        pathCount={1}
        expanded
        onToggleExpanded={() => {}}
        onToggleVisible={() => {}}
      />,
    );

    expect(screen.getByTitle("Collapse layer")).toBeDefined();
  });
});
