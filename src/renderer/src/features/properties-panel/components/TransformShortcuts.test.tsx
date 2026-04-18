import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TransformShortcuts } from "./TransformShortcuts";

describe("TransformShortcuts", () => {
  it("forwards scale and rotation button callbacks", () => {
    const onFitToBed = vi.fn();
    const onResetScale = vi.fn();
    const onRotateCcw = vi.fn();
    const onRotateCw = vi.fn();
    const onToggleCentreMarker = vi.fn();
    const onSnapToNextPreset = vi.fn();

    render(
      <TransformShortcuts
        fitScale={1.234}
        fitScaleX={1.5}
        fitScaleY={1.2}
        rotStep={45}
        rotSteps={[1, 5, 15, 45, 90]}
        stepFlyoutOpen={false}
        showCentreMarker={true}
        ratioLocked={true}
        snapPresetTitle="Snap to next preset (0° · 90°)"
        canScaleToTemplate={false}
        templateScaleEnabled={false}
        templateScaleTarget="page"
        onFitToBed={onFitToBed}
        onFitHorizontal={() => {}}
        onFitVertical={() => {}}
        onResetScale={onResetScale}
        onTemplateScaleEnabledChange={() => {}}
        onTemplateScaleTargetChange={() => {}}
        onRotateCcw={onRotateCcw}
        onRotateCw={onRotateCw}
        onToggleStepFlyout={() => {}}
        onCloseStepFlyout={() => {}}
        onSelectRotStep={() => {}}
        onToggleCentreMarker={onToggleCentreMarker}
        onSnapToNextPreset={onSnapToNextPreset}
      />,
    );

    fireEvent.click(screen.getByTitle("Fit to bed (scale 1.234)"));
    expect(onFitToBed).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByTitle("Reset scale + ratio lock to 1:1 (1 SVG unit = 1 mm)"),
    );
    expect(onResetScale).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Rotate 45° counter-clockwise"));
    expect(onRotateCcw).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Rotate 45° clockwise"));
    expect(onRotateCw).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Hide centre marker"));
    expect(onToggleCentreMarker).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Snap to next preset (0° · 90°)"));
    expect(onSnapToNextPreset).toHaveBeenCalledTimes(1);
  });

  it("handles step flyout interactions", () => {
    const onToggleStepFlyout = vi.fn();
    const onCloseStepFlyout = vi.fn();
    const onSelectRotStep = vi.fn();

    const { container } = render(
      <TransformShortcuts
        fitScale={2}
        fitScaleX={2}
        fitScaleY={2}
        rotStep={45}
        rotSteps={[1, 5, 15, 45, 90]}
        stepFlyoutOpen={true}
        showCentreMarker={false}
        ratioLocked={true}
        snapPresetTitle="snap"
        canScaleToTemplate={false}
        templateScaleEnabled={false}
        templateScaleTarget="page"
        onFitToBed={() => {}}
        onFitHorizontal={() => {}}
        onFitVertical={() => {}}
        onResetScale={() => {}}
        onTemplateScaleEnabledChange={() => {}}
        onTemplateScaleTargetChange={() => {}}
        onRotateCcw={() => {}}
        onRotateCw={() => {}}
        onToggleStepFlyout={onToggleStepFlyout}
        onCloseStepFlyout={onCloseStepFlyout}
        onSelectRotStep={onSelectRotStep}
        onToggleCentreMarker={() => {}}
        onSnapToNextPreset={() => {}}
      />,
    );

    fireEvent.click(screen.getByTitle("Change rotation step"));
    expect(onToggleStepFlyout).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("90°"));
    expect(onSelectRotStep).toHaveBeenCalledWith(90);

    const backdrop = container.querySelector(".fixed.inset-0.z-10");
    if (!backdrop) throw new Error("expected flyout backdrop");
    fireEvent.click(backdrop);
    expect(onCloseStepFlyout).toHaveBeenCalledTimes(1);
  });
});
