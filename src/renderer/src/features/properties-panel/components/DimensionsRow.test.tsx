import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DimensionsRow } from "./DimensionsRow";

const baseProps = {
  objW: 100,
  objH: 50,
  svgWidth: 200,
  svgHeight: 100,
  ratioLocked: true,
  currentScaleX: 0.5,
  currentScaleY: 0.5,
  onUpdate: vi.fn(),
  onRatioLockedChange: vi.fn(),
};

describe("DimensionsRow", () => {
  it("renders W and H inputs with computed values", () => {
    render(<DimensionsRow {...baseProps} />);
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(2);
    expect((inputs[0] as HTMLInputElement).value).toBe("100");
    expect((inputs[1] as HTMLInputElement).value).toBe("50");
  });

  it("renders ratio lock button in locked state by default", () => {
    render(<DimensionsRow {...baseProps} />);
    const btn = screen.getByTitle("Ratio locked — click to unlock");
    expect(btn).toBeTruthy();
  });

  it("updates uniform scale when W changes with ratio locked", () => {
    const onUpdate = vi.fn();
    render(<DimensionsRow {...baseProps} onUpdate={onUpdate} />);
    const [wInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(wInput, { target: { value: "200" } });
    expect(onUpdate).toHaveBeenCalledWith({
      scale: 200 / 200,
      scaleX: undefined,
      scaleY: undefined,
    });
  });

  it("updates only scaleX when W changes with ratio unlocked", () => {
    const onUpdate = vi.fn();
    render(
      <DimensionsRow {...baseProps} ratioLocked={false} onUpdate={onUpdate} />,
    );
    const [wInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(wInput, { target: { value: "160" } });
    expect(onUpdate).toHaveBeenCalledWith({ scaleX: 160 / 200 });
  });

  it("updates uniform scale when H changes with ratio locked", () => {
    const onUpdate = vi.fn();
    render(<DimensionsRow {...baseProps} onUpdate={onUpdate} />);
    const [, hInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(hInput, { target: { value: "200" } });
    expect(onUpdate).toHaveBeenCalledWith({
      scale: 200 / 100,
      scaleX: undefined,
      scaleY: undefined,
    });
  });

  it("updates only scaleY when H changes with ratio unlocked", () => {
    const onUpdate = vi.fn();
    render(
      <DimensionsRow {...baseProps} ratioLocked={false} onUpdate={onUpdate} />,
    );
    const [, hInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(hInput, { target: { value: "75" } });
    expect(onUpdate).toHaveBeenCalledWith({ scaleY: 75 / 100 });
  });

  it("calls onRatioLockedChange(false) and splits scales on unlock", () => {
    const onUpdate = vi.fn();
    const onRatioLockedChange = vi.fn();
    render(
      <DimensionsRow
        {...baseProps}
        ratioLocked={true}
        onUpdate={onUpdate}
        onRatioLockedChange={onRatioLockedChange}
      />,
    );
    const lockBtn = screen.getByTitle("Ratio locked — click to unlock");
    fireEvent.click(lockBtn);
    expect(onRatioLockedChange).toHaveBeenCalledWith(false);
    expect(onUpdate).toHaveBeenCalledWith({
      scaleX: baseProps.currentScaleX,
      scaleY: baseProps.currentScaleY,
    });
  });

  it("calls onRatioLockedChange(true) and unifies scale on re-lock", () => {
    const onUpdate = vi.fn();
    const onRatioLockedChange = vi.fn();
    render(
      <DimensionsRow
        {...baseProps}
        ratioLocked={false}
        onUpdate={onUpdate}
        onRatioLockedChange={onRatioLockedChange}
      />,
    );
    const unlockBtn = screen.getByTitle("Ratio unlocked — click to lock");
    fireEvent.click(unlockBtn);
    expect(onRatioLockedChange).toHaveBeenCalledWith(true);
    expect(onUpdate).toHaveBeenCalledWith({
      scale: baseProps.currentScaleX,
      scaleX: undefined,
      scaleY: undefined,
    });
  });
});
