import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ROT_STEPS } from "../utils/rotation";
import { TransformControlsSection } from "./TransformControlsSection";

const baseShortcuts = {
  fitScale: 1,
  fitScaleX: 1,
  fitScaleY: 1,
  ratioLocked: true,
  canScaleToTemplate: false,
  templateScaleEnabled: false,
  templateScaleTarget: "page" as const,
  onFitHorizontal: vi.fn(),
  onFitVertical: vi.fn(),
  onTemplateScaleEnabledChange: vi.fn(),
  onTemplateScaleTargetChange: vi.fn(),
  rotStep: 45 as const,
  rotSteps: ROT_STEPS,
  stepFlyoutOpen: false,
  showCentreMarker: false,
  snapPresetTitle: "snap",
  onFitToBed: vi.fn(),
  onResetScale: vi.fn(),
  onRotateCcw: vi.fn(),
  onRotateCw: vi.fn(),
  onToggleStepFlyout: vi.fn(),
  onCloseStepFlyout: vi.fn(),
  onSelectRotStep: vi.fn(),
  onToggleCentreMarker: vi.fn(),
  onSnapToNextPreset: vi.fn(),
};

describe("TransformControlsSection", () => {
  it("renders Scale and Rotation fields and forwards updates", () => {
    const onChangeScale = vi.fn();
    const onChangeRotation = vi.fn();

    render(
      <TransformControlsSection
        scale={1}
        rotation={0}
        onChangeScale={onChangeScale}
        onChangeRotation={onChangeRotation}
        sharedTransformProps={baseShortcuts}
      />,
    );

    expect(screen.getByText("Scale")).toBeTruthy();
    expect(screen.getByText("Rotation (°)")).toBeTruthy();

    const spinbuttons = screen.getAllByRole("spinbutton");
    fireEvent.change(spinbuttons[0], { target: { value: "2" } });
    fireEvent.change(spinbuttons[1], { target: { value: "90" } });

    expect(onChangeScale).toHaveBeenCalledWith(2);
    expect(onChangeRotation).toHaveBeenCalledWith(90);
  });
});
