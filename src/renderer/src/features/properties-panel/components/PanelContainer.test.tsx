import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanelContainer } from "./PanelContainer";

describe("PanelContainer", () => {
  it("renders children", () => {
    render(
      <PanelContainer>
        <span>content</span>
      </PanelContainer>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("applies flex column full-height layout classes", () => {
    const { container } = render(
      <PanelContainer>
        <span />
      </PanelContainer>,
    );
    expect(container.firstChild).toHaveClass("flex", "flex-col", "h-full");
  });
});
