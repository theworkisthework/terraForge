import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SvgImport } from "../../../../types";
import { PlotPointsSection } from "./PlotPointsSection";

function buildImport(patch: Partial<SvgImport> = {}): SvgImport {
  return {
    id: "imp-1",
    name: "sample",
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    svgWidth: 10,
    svgHeight: 10,
    viewBoxX: 0,
    viewBoxY: 0,
    paths: [{ id: "p1", d: "M0 0", svgSource: "<path />", visible: true }],
    ...patch,
  };
}

describe("PlotPointsSection", () => {
  it("does not render when no point candidates exist", () => {
    render(<PlotPointsSection imp={buildImport()} onUpdate={() => {}} />);
    expect(screen.queryByText("Plot points")).toBeNull();
  });

  it("renders and toggles point plotting", () => {
    const onUpdate = vi.fn();
    render(
      <PlotPointsSection
        imp={buildImport({
          paths: [
            {
              id: "p1",
              d: "M0 0",
              svgSource: "<circle />",
              visible: true,
              pointTap: { x: 2, y: 3 },
            },
          ],
          plotPointsEnabled: false,
        })}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByText("Plot points")).toBeDefined();
    fireEvent.click(screen.getByRole("switch"));
    expect(onUpdate).toHaveBeenCalledWith({ plotPointsEnabled: true });
  });
});
