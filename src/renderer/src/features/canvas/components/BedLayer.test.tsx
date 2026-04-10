import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BedLayer } from "./BedLayer";
import { MM_TO_PX, PAD } from "../constants";

describe("BedLayer", () => {
  it("renders a rect element", () => {
    const { container } = render(<BedLayer bedW={220} bedH={200} />);
    const rect = container.querySelector("rect");
    expect(rect).toBeTruthy();
  });

  it("positions the rect at the PAD offset", () => {
    const { container } = render(<BedLayer bedW={220} bedH={200} />);
    const rect = container.querySelector("rect");
    expect(rect?.getAttribute("x")).toBe(String(PAD));
    expect(rect?.getAttribute("y")).toBe(String(PAD));
  });

  it("scales the rect to bed dimensions", () => {
    const bedW = 220;
    const bedH = 200;
    const { container } = render(<BedLayer bedW={bedW} bedH={bedH} />);
    const rect = container.querySelector("rect");
    expect(rect?.getAttribute("width")).toBe(String(bedW * MM_TO_PX));
    expect(rect?.getAttribute("height")).toBe(String(bedH * MM_TO_PX));
  });

  it("has no fill", () => {
    const { container } = render(<BedLayer bedW={220} bedH={200} />);
    const rect = container.querySelector("rect");
    expect(rect?.getAttribute("fill")).toBe("none");
  });

  it("has a border stroke", () => {
    const { container } = render(<BedLayer bedW={220} bedH={200} />);
    const rect = container.querySelector("rect");
    expect(rect?.getAttribute("stroke")).toBe("var(--tf-border)");
    expect(rect?.getAttribute("stroke-width")).toBe("1");
  });

  it("has a test ID", () => {
    const { getByTestId } = render(<BedLayer bedW={220} bedH={200} />);
    expect(getByTestId("bed-layer")).toBeTruthy();
  });
});
