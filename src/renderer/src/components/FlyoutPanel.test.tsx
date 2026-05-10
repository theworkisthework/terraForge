import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FlyoutPanel } from "./FlyoutPanel";

describe("FlyoutPanel", () => {
  it("renders children only when open", () => {
    const { rerender } = render(
      <FlyoutPanel open={false} onClose={() => {}}>
        <div>Flyout content</div>
      </FlyoutPanel>,
    );

    expect(screen.queryByText("Flyout content")).toBeNull();

    rerender(
      <FlyoutPanel open onClose={() => {}}>
        <div>Flyout content</div>
      </FlyoutPanel>,
    );

    expect(screen.getByText("Flyout content")).toBeInTheDocument();
  });

  it("calls onClose when clicking outside", () => {
    const onClose = vi.fn();

    render(
      <FlyoutPanel open onClose={onClose}>
        <div>Flyout content</div>
      </FlyoutPanel>,
    );

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside", () => {
    const onClose = vi.fn();

    render(
      <FlyoutPanel open onClose={onClose}>
        <div>Flyout content</div>
      </FlyoutPanel>,
    );

    fireEvent.mouseDown(screen.getByText("Flyout content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();

    render(
      <FlyoutPanel open onClose={onClose}>
        <div>Flyout content</div>
      </FlyoutPanel>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
