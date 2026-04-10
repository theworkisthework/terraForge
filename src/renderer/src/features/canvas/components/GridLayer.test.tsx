import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { GridLayer } from "./GridLayer";
import { MM_TO_PX, PAD } from "../constants";

describe("GridLayer", () => {
  const bedW = 220;
  const bedH = 200;
  const getBedY = (mm: number) => PAD + (bedH - mm) * MM_TO_PX;

  it("renders vertical grid lines", () => {
    const { container } = render(
      <svg>
        <GridLayer bedW={bedW} bedH={bedH} getBedY={getBedY} />
      </svg>,
    );
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("renders major (50mm) vertical lines with thicker stroke", () => {
    const { container } = render(
      <svg>
        <GridLayer bedW={bedW} bedH={bedH} getBedY={getBedY} />
      </svg>,
    );
    const lines = container.querySelectorAll('line[data-testid^="grid-v-"]');
    // Find a major line (e.g., at 50mm)
    let found50mm = false;
    lines.forEach((line) => {
      if (line.getAttribute("data-testid") === "grid-v-50") {
        expect(line.getAttribute("stroke-width")).toBe("0.8");
        found50mm = true;
      }
    });
    expect(found50mm).toBe(true);
  });

  it("renders minor (10mm) vertical lines with thinner stroke", () => {
    const { container } = render(
      <svg>
        <GridLayer bedW={bedW} bedH={bedH} getBedY={getBedY} />
      </svg>,
    );
    const lines = container.querySelectorAll('line[data-testid^="grid-v-"]');
    // Find a minor line (e.g., at 10mm)
    let found10mm = false;
    lines.forEach((line) => {
      if (line.getAttribute("data-testid") === "grid-v-10") {
        expect(line.getAttribute("stroke-width")).toBe("0.3");
        found10mm = true;
      }
    });
    expect(found10mm).toBe(true);
  });

  it("renders horizontal grid lines", () => {
    const { container } = render(
      <svg>
        <GridLayer bedW={bedW} bedH={bedH} getBedY={getBedY} />
      </svg>,
    );
    const lines = container.querySelectorAll('line[data-testid^="grid-h-"]');
    expect(lines.length).toBeGreaterThan(0);
  });

  it("calls getBedY callback for horizontal lines", () => {
    const getBedYMock = vi.fn((mm) => PAD + (bedH - mm) * MM_TO_PX);
    const { container } = render(
      <svg>
        <GridLayer bedW={bedW} bedH={bedH} getBedY={getBedYMock} />
      </svg>,
    );
    const lines = container.querySelectorAll('line[data-testid^="grid-h-"]');
    // getBedY should be called for each horizontal grid line
    expect(getBedYMock.mock.calls.length).toBeGreaterThan(0);
  });

  it("covers the full bed width with vertical lines", () => {
    const { container } = render(
      <svg>
        <GridLayer bedW={bedW} bedH={bedH} getBedY={getBedY} />
      </svg>,
    );
    const vLines = container.querySelectorAll('line[data-testid^="grid-v-"]');
    // Should have lines from 0 to bedW in 10mm increments
    const expectedCount = Math.floor(bedW / 10) + 1;
    expect(vLines.length).toBe(expectedCount);
  });

  it("covers the full bed height with horizontal lines", () => {
    const { container } = render(
      <svg>
        <GridLayer bedW={bedW} bedH={bedH} getBedY={getBedY} />
      </svg>,
    );
    const hLines = container.querySelectorAll('line[data-testid^="grid-h-"]');
    // Should have lines from 0 to bedH in 10mm increments
    const expectedCount = Math.floor(bedH / 10) + 1;
    expect(hLines.length).toBe(expectedCount);
  });
});
