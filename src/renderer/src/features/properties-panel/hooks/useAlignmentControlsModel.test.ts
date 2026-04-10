import { describe, expect, it, vi } from "vitest";
import { useAlignmentControlsModel } from "./useAlignmentControlsModel";

describe("useAlignmentControlsModel", () => {
  it("uses bed bounds when template alignment is disabled", () => {
    const onAlignX = vi.fn();
    const onAlignY = vi.fn();

    const model = useAlignmentControlsModel({
      objW: 20,
      objH: 10,
      bedW: 200,
      bedH: 100,
      pageW: 210,
      pageH: 297,
      marginMM: 20,
      canAlignToTemplate: true,
      templateAlignEnabled: false,
      templateAlignTarget: "page",
      onAlignX,
      onAlignY,
    });

    expect(model.leftTitle).toBe("Align left edge to bed left (X = 0)");
    expect(model.bottomTitle).toBe("Align bottom edge to bed bottom (Y = 0)");
    expect(model.targetControlDisabled).toBe(true);

    model.onAlignRight();
    model.onAlignTop();

    expect(onAlignX).toHaveBeenCalledWith(180);
    expect(onAlignY).toHaveBeenCalledWith(90);
  });

  it("uses template margin bounds when enabled", () => {
    const onAlignX = vi.fn();
    const onAlignY = vi.fn();

    const model = useAlignmentControlsModel({
      objW: 30,
      objH: 15,
      bedW: 200,
      bedH: 100,
      pageW: 210,
      pageH: 297,
      marginMM: 20,
      canAlignToTemplate: true,
      templateAlignEnabled: true,
      templateAlignTarget: "margin",
      onAlignX,
      onAlignY,
    });

    expect(model.leftTitle).toBe("Align left edge to margin left (X = 20)");
    expect(model.bottomTitle).toBe(
      "Align bottom edge to margin bottom (Y = 20 mm)",
    );
    expect(model.targetControlDisabled).toBe(false);

    model.onAlignCenterX();
    model.onAlignCenterY();

    expect(onAlignX).toHaveBeenCalledWith(90);
    expect(onAlignY).toHaveBeenCalledWith(141);
  });
});
