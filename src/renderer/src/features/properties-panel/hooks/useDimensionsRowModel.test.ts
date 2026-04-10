import { describe, expect, it, vi } from "vitest";
import { useDimensionsRowModel } from "./useDimensionsRowModel";

const buildArgs = () => ({
  objW: 100,
  objH: 50,
  svgWidth: 200,
  svgHeight: 100,
  ratioLocked: true,
  currentScaleX: 0.5,
  currentScaleY: 0.5,
  onUpdate: vi.fn(),
  onRatioLockedChange: vi.fn(),
});

describe("useDimensionsRowModel", () => {
  it("derives values and updates uniform width scaling when locked", () => {
    const args = buildArgs();
    const model = useDimensionsRowModel(args);

    expect(model.widthValue).toBe(100);
    expect(model.heightValue).toBe(50);
    expect(model.ratioLockTitle).toBe("Ratio locked — click to unlock");

    model.onWidthChange(160);
    expect(args.onUpdate).toHaveBeenCalledWith({
      scale: 160 / 200,
      scaleX: undefined,
      scaleY: undefined,
    });
  });

  it("updates independent scales and lock toggle transitions when unlocked", () => {
    const args = {
      ...buildArgs(),
      ratioLocked: false,
      currentScaleX: 0.7,
      currentScaleY: 0.8,
    };
    const model = useDimensionsRowModel(args);

    expect(model.ratioLockTitle).toBe("Ratio unlocked — click to lock");

    model.onHeightChange(75);
    expect(args.onUpdate).toHaveBeenCalledWith({ scaleY: 75 / 100 });

    model.onToggleRatioLock();
    expect(args.onRatioLockedChange).toHaveBeenCalledWith(true);
    expect(args.onUpdate).toHaveBeenCalledWith({
      scale: 0.7,
      scaleX: undefined,
      scaleY: undefined,
    });
  });
});
