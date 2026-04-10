import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SelectionOverlay } from "./SelectionOverlay";

describe("SelectionOverlay", () => {
  it("renders a polygon element", () => {
    const polyPoints = "10,10 50,10 50,50 10,50";
    const { container } = render(
      <svg>
        <SelectionOverlay polyPoints={polyPoints} />
      </svg>,
    );
    const polygon = container.querySelector("polygon");
    expect(polygon).toBeTruthy();
  });

  it("sets polygon points from prop", () => {
    const polyPoints = "10,10 50,10 50,50 10,50";
    const { container } = render(
      <svg>
        <SelectionOverlay polyPoints={polyPoints} />
      </svg>,
    );
    const polygon = container.querySelector("polygon");
    expect(polygon?.getAttribute("points")).toBe(polyPoints);
  });

  it("has no fill", () => {
    const polyPoints = "10,10 50,10 50,50 10,50";
    const { container } = render(
      <svg>
        <SelectionOverlay polyPoints={polyPoints} />
      </svg>,
    );
    const polygon = container.querySelector("polygon");
    expect(polygon?.getAttribute("fill")).toBe("none");
  });

  it("uses accent color for stroke", () => {
    const polyPoints = "10,10 50,10 50,50 10,50";
    const { container } = render(
      <svg>
        <SelectionOverlay polyPoints={polyPoints} />
      </svg>,
    );
    const polygon = container.querySelector("polygon");
    expect(polygon?.getAttribute("stroke")).toBe("var(--tf-accent)");
  });

  it("uses dashed stroke pattern", () => {
    const polyPoints = "10,10 50,10 50,50 10,50";
    const { container } = render(
      <svg>
        <SelectionOverlay polyPoints={polyPoints} />
      </svg>,
    );
    const polygon = container.querySelector("polygon");
    expect(polygon?.getAttribute("stroke-dasharray")).toBe("4 2");
  });

  it("has a test ID", () => {
    const polyPoints = "10,10 50,10 50,50 10,50";
    const { getByTestId } = render(
      <svg>
        <SelectionOverlay polyPoints={polyPoints} />
      </svg>,
    );
    expect(getByTestId("selection-bbox")).toBeTruthy();
  });
});
