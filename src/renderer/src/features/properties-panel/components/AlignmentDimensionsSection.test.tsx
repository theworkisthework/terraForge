import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AlignmentDimensionsSection } from "./AlignmentDimensionsSection";

describe("AlignmentDimensionsSection", () => {
  it("renders alignment controls and dimensions fields", () => {
    render(
      <AlignmentDimensionsSection
        objW={100}
        objH={50}
        bedW={220}
        bedH={200}
        pageW={210}
        pageH={297}
        marginMM={20}
        canAlignToTemplate={true}
        templateAlignEnabled={false}
        templateAlignTarget="page"
        onTemplateAlignEnabledChange={vi.fn()}
        onTemplateAlignTargetChange={vi.fn()}
        onAlignX={vi.fn()}
        onAlignY={vi.fn()}
        svgWidth={100}
        svgHeight={50}
        ratioLocked={true}
        currentScaleX={1}
        currentScaleY={1}
        onUpdate={vi.fn()}
        onRatioLockedChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Align to template")).toBeTruthy();
    expect(screen.getByText("W (mm)")).toBeTruthy();
    expect(screen.getByText("H (mm)")).toBeTruthy();
  });
});
