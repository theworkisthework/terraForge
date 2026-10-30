import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ROT_STEPS } from "../utils/rotation";
import { RotationStepFlyout } from "./RotationStepFlyout";

describe("RotationStepFlyout", () => {
  it("toggles and selects a rotation step", () => {
    const onToggleStepFlyout = vi.fn();
    const onCloseStepFlyout = vi.fn();
    const onSelectRotStep = vi.fn();

    const { container } = render(
      <RotationStepFlyout
        rotStep={45}
        rotSteps={ROT_STEPS}
        stepFlyoutOpen={true}
        onToggleStepFlyout={onToggleStepFlyout}
        onCloseStepFlyout={onCloseStepFlyout}
        onSelectRotStep={onSelectRotStep}
      />,
    );

    fireEvent.click(screen.getByTitle("Change rotation step"));
    expect(onToggleStepFlyout).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("30°"));
    expect(onSelectRotStep).toHaveBeenCalledWith(30);

    const backdrop = container.querySelector(".fixed.inset-0.z-10");
    if (!backdrop) throw new Error("expected flyout backdrop");
    fireEvent.click(backdrop);
    expect(onCloseStepFlyout).toHaveBeenCalledTimes(1);
  });

  it("hides menu options when flyout is closed", () => {
    render(
      <RotationStepFlyout
        rotStep={45}
        rotSteps={ROT_STEPS}
        stepFlyoutOpen={false}
        onToggleStepFlyout={() => {}}
        onCloseStepFlyout={() => {}}
        onSelectRotStep={() => {}}
      />,
    );

    expect(screen.queryByText("30°")).toBeNull();
  });
});
