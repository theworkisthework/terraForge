import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColorGroupRow } from "./ColorGroupRow";

describe("ColorGroupRow", () => {
  it("renders color metadata and forwards actions", () => {
    const onToggleExpanded = vi.fn();
    const onToggleVisible = vi.fn();
    const onTogglePassSettings = vi.fn();

    render(
      <ColorGroupRow
        color="#ff0000"
        visible
        pathCount={3}
        expanded={false}
        onToggleExpanded={onToggleExpanded}
        onToggleVisible={onToggleVisible}
        onTogglePassSettings={onTogglePassSettings}
      />,
    );

    expect(screen.getByText("#ff0000")).toBeInTheDocument();
    expect(screen.getByText("3p")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Expand color group"));
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Toggle color group visibility"));
    expect(onToggleVisible).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Open colour pass settings"));
    expect(onTogglePassSettings).toHaveBeenCalledTimes(1);
  });

  it("shows collapse title when expanded", () => {
    render(
      <ColorGroupRow
        color="#000000"
        visible={false}
        pathCount={1}
        expanded
        onToggleExpanded={() => {}}
        onToggleVisible={() => {}}
      />,
    );

    expect(screen.getByTitle("Collapse color group")).toBeDefined();
  });
});
