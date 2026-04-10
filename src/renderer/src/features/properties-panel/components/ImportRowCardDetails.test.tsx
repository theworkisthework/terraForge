import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SvgImport } from "../../../../../types";
import { ImportRowCardDetails } from "./ImportRowCardDetails";

vi.mock("./ImportPropertiesForm", () => ({
  ImportPropertiesForm: () => <div data-testid="import-properties-form" />,
}));

const mockImport: SvgImport = {
  id: "imp-1",
  name: "import-1",
  paths: [],
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  visible: true,
  svgWidth: 100,
  svgHeight: 80,
  viewBoxX: 0,
  viewBoxY: 0,
};

describe("ImportRowCardDetails", () => {
  it("renders the properties form and stops drag-start propagation", () => {
    const { container } = render(
      <ImportRowCardDetails
        imp={mockImport}
        bedW={220}
        bedH={200}
        pageW={210}
        pageH={297}
        marginMM={20}
        canAlignToTemplate={false}
        templateAlignEnabled={false}
        templateAlignTarget="page"
        ratioLocked={true}
        rotStep={45}
        stepFlyoutOpen={false}
        showCentreMarker={false}
        onUpdate={vi.fn()}
        onTemplateAlignEnabledChange={vi.fn()}
        onTemplateAlignTargetChange={vi.fn()}
        onRatioLockedChange={vi.fn()}
        onToggleStepFlyout={vi.fn()}
        onCloseStepFlyout={vi.fn()}
        onSelectRotStep={vi.fn()}
        onToggleCentreMarker={vi.fn()}
        onChangeStrokeWidth={vi.fn()}
        onApplyHatch={vi.fn()}
      />,
    );

    expect(screen.getByTestId("import-properties-form")).toBeTruthy();

    const wrapper = container.firstElementChild as HTMLDivElement;
    expect(wrapper.className).toContain("border-t");

    const dragStartEvent = new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(dragStartEvent, "stopPropagation");

    fireEvent(wrapper, dragStartEvent);
    expect(stopPropagationSpy).toHaveBeenCalledTimes(1);
  });
});
