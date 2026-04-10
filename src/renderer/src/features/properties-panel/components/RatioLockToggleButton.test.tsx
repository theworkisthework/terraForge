import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RatioLockToggleButton } from "./RatioLockToggleButton";

describe("RatioLockToggleButton", () => {
  it("renders locked state and forwards click", () => {
    const onClick = vi.fn();
    render(
      <RatioLockToggleButton
        ratioLocked={true}
        title="Ratio locked — click to unlock"
        className="lock-class"
        onClick={onClick}
      />,
    );

    const button = screen.getByTitle("Ratio locked — click to unlock");
    expect(button.className).toBe("lock-class");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders unlocked title", () => {
    render(
      <RatioLockToggleButton
        ratioLocked={false}
        title="Ratio unlocked — click to lock"
        className="unlock-class"
        onClick={() => {}}
      />,
    );

    expect(screen.getByTitle("Ratio unlocked — click to lock")).toBeTruthy();
  });
});
