import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Tooltip } from "../../src/renderer/src/components/Tooltip";

describe("Tooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders children without showing tooltip initially", () => {
    render(
      <Tooltip text="Hello">
        <button>Hover me</button>
      </Tooltip>,
    );
    expect(screen.getByText("Hover me")).toBeDefined();
    expect(screen.queryByText("Hello")).toBeNull();
  });

  it("shows tooltip after the delay when mouse enters", () => {
    render(
      <Tooltip text="My tooltip" delayMs={500}>
        <button>Trigger</button>
      </Tooltip>,
    );
    const wrapper = screen.getByText("Trigger").parentElement!;
    fireEvent.mouseEnter(wrapper);

    // Tooltip should not appear before delay
    expect(screen.queryByText("My tooltip")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("My tooltip")).toBeDefined();
  });

  it("does not show tooltip if mouse leaves before delay expires", () => {
    render(
      <Tooltip text="Never shown" delayMs={800}>
        <span>Item</span>
      </Tooltip>,
    );
    const wrapper = screen.getByText("Item").parentElement!;
    fireEvent.mouseEnter(wrapper);

    act(() => {
      vi.advanceTimersByTime(400); // half the delay
    });

    fireEvent.mouseLeave(wrapper);

    act(() => {
      vi.advanceTimersByTime(800); // well past the original delay
    });

    expect(screen.queryByText("Never shown")).toBeNull();
  });

  it("hides tooltip when mouse leaves after it was shown", () => {
    render(
      <Tooltip text="Visible then gone" delayMs={300}>
        <div>Hover</div>
      </Tooltip>,
    );
    const wrapper = screen.getByText("Hover").parentElement!;
    fireEvent.mouseEnter(wrapper);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText("Visible then gone")).toBeDefined();

    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByText("Visible then gone")).toBeNull();
  });

  it("applies custom className to wrapper", () => {
    const { container } = render(
      <Tooltip text="Test" className="custom-class">
        <span>Child</span>
      </Tooltip>,
    );
    expect(
      container.firstElementChild?.classList.contains("custom-class"),
    ).toBe(true);
  });

  it("uses default delay of 1600ms when delayMs is not provided", () => {
    render(
      <Tooltip text="Default delay">
        <span>Hover</span>
      </Tooltip>,
    );
    const wrapper = screen.getByText("Hover").parentElement!;
    fireEvent.mouseEnter(wrapper);

    act(() => {
      vi.advanceTimersByTime(1599);
    });
    expect(screen.queryByText("Default delay")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText("Default delay")).toBeDefined();
  });

  it("re-shows tooltip if mouse re-enters after leaving before delay", () => {
    render(
      <Tooltip text="Re-entry" delayMs={200}>
        <span>Item</span>
      </Tooltip>,
    );
    const wrapper = screen.getByText("Item").parentElement!;

    // First hover — leave early
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(wrapper);

    // Second hover — wait full delay
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText("Re-entry")).toBeDefined();
  });
});
