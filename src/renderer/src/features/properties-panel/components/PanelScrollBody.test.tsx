import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanelScrollBody } from "./PanelScrollBody";

describe("PanelScrollBody", () => {
  it("renders children", () => {
    render(
      <PanelScrollBody>
        <span>scroll content</span>
      </PanelScrollBody>,
    );
    expect(screen.getByText("scroll content")).toBeInTheDocument();
  });

  it("applies scrollable layout classes", () => {
    const { container } = render(
      <PanelScrollBody>
        <span />
      </PanelScrollBody>,
    );
    expect(container.firstChild).toHaveClass(
      "flex-1",
      "overflow-y-auto",
      "overflow-x-hidden",
    );
  });
});
