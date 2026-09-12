import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ImportLayer } from "./ImportLayer";
import type { SvgImport } from "../../../../../types";

function makeBitmapImport(overrides?: Partial<SvgImport>): SvgImport {
  return {
    id: "imp-1",
    name: "photo",
    kind: "bitmap",
    paths: [],
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    svgWidth: 10,
    svgHeight: 10,
    viewBoxX: 0,
    viewBoxY: 0,
    bitmapDataUrl: "data:image/png;base64,xxxx",
    ...overrides,
  };
}

const defaultProps = {
  selected: false,
  onImportMouseDown: vi.fn(),
  getBedY: (mm: number) => mm,
};

describe("ImportLayer bitmap preview", () => {
  it("renders one path per visible ink channel when separation is active", () => {
    const imp = makeBitmapImport({
      paths: [
        { id: "ink-0", d: "M0 0 L1 1", svgSource: "", visible: true, strokeColor: "#00ffff" },
        { id: "ink-1", d: "M2 2 L3 3", svgSource: "", visible: true, strokeColor: "#ff00ff" },
      ],
    });

    const { container } = render(<ImportLayer imp={imp} {...defaultProps} />);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute("stroke")).toBe("#00ffff");
    expect(paths[1].getAttribute("stroke")).toBe("#ff00ff");
  });

  it("hides an ink channel whose colour-group toggle disabled its stroke", () => {
    const imp = makeBitmapImport({
      paths: [
        { id: "ink-0", d: "M0 0 L1 1", svgSource: "", visible: true, strokeColor: "#00ffff", strokeEnabled: false },
        { id: "ink-1", d: "M2 2 L3 3", svgSource: "", visible: true, strokeColor: "#ff00ff" },
      ],
    });

    const { container } = render(<ImportLayer imp={imp} {...defaultProps} />);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute("stroke")).toBe("#ff00ff");
  });

  it("hides every ink channel when the bitmap preview toggle is off, regardless of per-channel visibility", () => {
    const imp = makeBitmapImport({
      bitmapPreviewVisible: false,
      paths: [
        { id: "ink-0", d: "M0 0 L1 1", svgSource: "", visible: true, strokeColor: "#00ffff" },
      ],
    });

    const { container } = render(<ImportLayer imp={imp} {...defaultProps} />);
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });

  it("falls back to the single legacy path when separation is inactive (paths empty)", () => {
    const imp = makeBitmapImport({ paths: [], bitmapRendererPath: "M0 0 L5 5" });

    const { container } = render(<ImportLayer imp={imp} {...defaultProps} />);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute("d")).toBe("M0 0 L5 5");
  });
});
