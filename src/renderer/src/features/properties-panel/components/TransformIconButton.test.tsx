import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransformIconButton } from "./TransformIconButton";

describe("TransformIconButton", () => {
  it("renders content and forwards click", () => {
    const onClick = vi.fn();

    render(
      <TransformIconButton title="Action" onClick={onClick}>
        <span>child</span>
      </TransformIconButton>,
    );

    const button = screen.getByTitle("Action");
    expect(button.className).toContain("hover:bg-secondary/40");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses custom className when provided", () => {
    render(
      <TransformIconButton
        title="Custom"
        onClick={() => {}}
        className="custom-class"
      >
        <span>child</span>
      </TransformIconButton>,
    );

    expect(screen.getByTitle("Custom").className).toBe("custom-class");
  });
});
