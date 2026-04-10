import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AlignmentControls } from "./AlignmentControls";

describe("AlignmentControls", () => {
  it("forwards align callbacks", () => {
    const onAlignX = vi.fn();
    const onAlignY = vi.fn();

    render(
      <AlignmentControls
        objW={20}
        objH={10}
        bedW={200}
        bedH={100}
        pageW={210}
        pageH={297}
        marginMM={20}
        canAlignToTemplate={false}
        templateAlignEnabled={false}
        templateAlignTarget="page"
        onTemplateAlignEnabledChange={() => {}}
        onTemplateAlignTargetChange={() => {}}
        onAlignX={onAlignX}
        onAlignY={onAlignY}
      />,
    );

    fireEvent.click(screen.getByTitle("Align left edge to bed left (X = 0)"));
    expect(onAlignX).toHaveBeenCalledWith(0);

    fireEvent.click(
      screen.getByTitle("Align bottom edge to bed bottom (Y = 0)"),
    );
    expect(onAlignY).toHaveBeenCalledWith(0);
  });

  it("handles template alignment toggles", () => {
    const onTemplateAlignEnabledChange = vi.fn();
    const onTemplateAlignTargetChange = vi.fn();

    render(
      <AlignmentControls
        objW={20}
        objH={10}
        bedW={200}
        bedH={100}
        pageW={210}
        pageH={297}
        marginMM={20}
        canAlignToTemplate={true}
        templateAlignEnabled={true}
        templateAlignTarget="page"
        onTemplateAlignEnabledChange={onTemplateAlignEnabledChange}
        onTemplateAlignTargetChange={onTemplateAlignTargetChange}
        onAlignX={() => {}}
        onAlignY={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Margin" }));
    expect(onTemplateAlignTargetChange).toHaveBeenCalledWith("margin");

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Align to template" }),
    );
    expect(onTemplateAlignEnabledChange).toHaveBeenCalledWith(false);
  });
});
