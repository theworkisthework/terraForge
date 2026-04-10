import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SvgImport } from "../../../../types";
import { HatchFillSection } from "./HatchFillSection";

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

describe("HatchFillSection", () => {
  it("does not render when import has no filled paths", () => {
    render(
      <HatchFillSection
        imp={buildImport()}
        defaultSpacingMM={2}
        defaultAngleDeg={45}
        onApplyHatch={() => {}}
      />,
    );

    expect(screen.queryByText("Hatch fill")).toBeNull();
  });

  it("renders controls and forwards actions", () => {
    const onApplyHatch = vi.fn();
    render(
      <HatchFillSection
        imp={buildImport({
          paths: [
            {
              id: "p1",
              d: "M0 0",
              svgSource: "<path />",
              visible: true,
              hasFill: true,
            },
          ],
          hatchEnabled: true,
          hatchSpacingMM: 2,
          hatchAngleDeg: 45,
        })}
        defaultSpacingMM={2}
        defaultAngleDeg={45}
        onApplyHatch={onApplyHatch}
      />,
    );

    expect(screen.getByText("Hatch fill")).toBeDefined();
    expect(screen.getByText("Spacing (mm)")).toBeDefined();
    expect(screen.getByText("Angle (°)")).toBeDefined();

    fireEvent.click(screen.getByRole("switch"));
    expect(onApplyHatch).toHaveBeenCalledWith("imp-1", 2, 45, false);
  });
});
