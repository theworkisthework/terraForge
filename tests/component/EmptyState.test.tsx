import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../../src/renderer/src/features/properties-panel/components/EmptyState";

describe("EmptyState", () => {
  it("renders the provided message", () => {
    render(<EmptyState message="No objects. Import an SVG." />);

    expect(screen.getByText("No objects. Import an SVG.")).toBeDefined();
  });

  it("updates message text on rerender", () => {
    const { rerender } = render(<EmptyState message="Initial state" />);
    expect(screen.getByText("Initial state")).toBeDefined();

    rerender(<EmptyState message="Updated state" />);
    expect(screen.getByText("Updated state")).toBeDefined();
    expect(screen.queryByText("Initial state")).toBeNull();
  });

  it("applies expected layout and text classes", () => {
    const { container } = render(<EmptyState message="Styled state" />);
    const paragraph = container.querySelector("p");

    expect(paragraph).not.toBeNull();
    expect(paragraph?.className).toContain("text-xs");
    expect(paragraph?.className).toContain("text-content-faint");
    expect(paragraph?.className).toContain("text-center");
  });
});
