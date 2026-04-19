import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SvgImport } from "../../../../types";
import { ImportPathsList } from "./ImportPathsList";

function buildImport(patch: Partial<SvgImport> = {}): SvgImport {
  return {
    id: "imp-1",
    name: "sample",
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    svgWidth: 10,
    svgHeight: 10,
    viewBoxX: 0,
    viewBoxY: 0,
    paths: [],
    ...patch,
  };
}

describe("ImportPathsList", () => {
  it("renders layered paths and forwards interactions", () => {
    const onSelectImport = vi.fn();
    const onToggleLayerCollapse = vi.fn();
    const onUpdateLayerVisibility = vi.fn();
    const onUpdatePathVisibility = vi.fn();
    const onUpdatePathStroke = vi.fn();
    const onRemovePath = vi.fn();

    const imp = buildImport({
      paths: [
        {
          id: "p1",
          d: "M0 0",
          svgSource: "<path />",
          visible: true,
          layer: "l1",
        },
        {
          id: "p2",
          d: "M1 1",
          svgSource: "<path />",
          visible: false,
          label: "loose",
        },
      ],
      layers: [{ id: "l1", name: "Ink", visible: true }],
    });

    render(
      <ImportPathsList
        imp={imp}
        expandedLayerKeys={new Set(["imp-1:l1"])}
        onSelectImport={onSelectImport}
        onToggleLayerCollapse={onToggleLayerCollapse}
        onUpdateLayerVisibility={onUpdateLayerVisibility}
        onUpdatePathVisibility={onUpdatePathVisibility}
        onUpdatePathStroke={onUpdatePathStroke}
        onRemovePath={onRemovePath}
      />,
    );

    expect(screen.getByText("Ink")).toBeDefined();

    fireEvent.click(screen.getByTitle("Collapse layer"));
    expect(onToggleLayerCollapse).toHaveBeenCalledWith("imp-1", "l1");

    fireEvent.click(screen.getByTitle("Toggle layer visibility"));
    expect(onUpdateLayerVisibility).toHaveBeenCalledWith("imp-1", "l1", false);

    fireEvent.click(screen.getByLabelText("Hide path"));
    expect(onUpdatePathVisibility).toHaveBeenCalledWith("imp-1", "p1", false);

    fireEvent.click(screen.getAllByLabelText("Disable path stroke")[0]);
    expect(onUpdatePathStroke).toHaveBeenCalledWith("imp-1", "p1", false);

    fireEvent.click(screen.getAllByRole("button", { name: "✕" })[0]);
    expect(onRemovePath).toHaveBeenCalledWith("imp-1", "p1");

    fireEvent.click(screen.getByText("loose"));
    expect(onSelectImport).toHaveBeenCalledWith("imp-1");
  });

  it("renders flat view when no layers are present", () => {
    const imp = buildImport({
      paths: [{ id: "p3", d: "M2 2", svgSource: "<path />", visible: true }],
    });

    render(
      <ImportPathsList
        imp={imp}
        expandedLayerKeys={new Set()}
        onSelectImport={() => {}}
        onToggleLayerCollapse={() => {}}
        onUpdateLayerVisibility={() => {}}
        onUpdatePathVisibility={() => {}}
        onUpdatePathStroke={() => {}}
        onRemovePath={() => {}}
      />,
    );

    expect(screen.getByText("path p3")).toBeDefined();
  });
});
