import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
        onUpdatePathFillEnabled={() => {}}
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
        onUpdatePathFillEnabled={() => {}}
        onUpdatePathStroke={() => {}}
        onRemovePath={() => {}}
      />,
    );

    expect(screen.getByText("path p3")).toBeDefined();
  });

  it("toggles color-group expansion using color-scoped key format", () => {
    const onToggleLayerCollapse = vi.fn();
    const imp = buildImport({
      paths: [
        {
          id: "p1",
          d: "M0 0",
          svgSource: "<path />",
          visible: true,
          hasFill: true,
          fillColor: "red",
        },
      ],
    });

    render(
      <ImportPathsList
        imp={imp}
        groupBy="color"
        expandedLayerKeys={new Set()}
        onSelectImport={() => {}}
        onToggleLayerCollapse={onToggleLayerCollapse}
        onUpdateLayerVisibility={() => {}}
        onUpdatePathVisibility={() => {}}
        onUpdatePathFillEnabled={() => {}}
        onUpdatePathStroke={() => {}}
        onRemovePath={() => {}}
      />,
    );

    fireEvent.click(screen.getByTitle("Expand color group"));
    expect(onToggleLayerCollapse).toHaveBeenCalledWith(
      "imp-1",
      "color:#ff0000",
    );
  });

  it("toggles fill enabled for all paths in a color group", () => {
    const onUpdatePathFillEnabled = vi.fn();
    const imp = buildImport({
      paths: [
        {
          id: "p1",
          d: "M0 0",
          svgSource: "<path />",
          visible: true,
          hasFill: true,
          fillColor: "#ff0000",
        },
        {
          id: "p2",
          d: "M1 1",
          svgSource: "<path />",
          visible: true,
          hasFill: true,
          fillColor: "#ff0000",
        },
      ],
    });

    render(
      <ImportPathsList
        imp={imp}
        groupBy="color"
        expandedLayerKeys={new Set(["imp-1:color:#ff0000"])}
        onSelectImport={() => {}}
        onToggleLayerCollapse={() => {}}
        onUpdateLayerVisibility={() => {}}
        onUpdatePathVisibility={() => {}}
        onUpdatePathFillEnabled={onUpdatePathFillEnabled}
        onUpdatePathStroke={() => {}}
        onRemovePath={() => {}}
      />,
    );

    fireEvent.click(screen.getByTitle("Toggle color group visibility"));

    expect(onUpdatePathFillEnabled).toHaveBeenCalledWith("imp-1", "p1", false);
    expect(onUpdatePathFillEnabled).toHaveBeenCalledWith("imp-1", "p2", false);
  });

  it("groups stroke-only paths by source color", () => {
    const imp = buildImport({
      paths: [
        {
          id: "p1",
          d: "M0 0",
          svgSource: "<path />",
          visible: true,
          strokeColor: "#000000",
          sourceColor: "#000000",
          sourceOutlineVisible: true,
          hasFill: false,
        },
      ],
    });

    render(
      <ImportPathsList
        imp={imp}
        groupBy="color"
        expandedLayerKeys={new Set()}
        onSelectImport={() => {}}
        onToggleLayerCollapse={() => {}}
        onUpdateLayerVisibility={() => {}}
        onUpdatePathVisibility={() => {}}
        onUpdatePathFillEnabled={() => {}}
        onUpdatePathStroke={() => {}}
        onRemovePath={() => {}}
      />,
    );

    expect(screen.getByText("#000000")).toBeDefined();
  });

  it("shows a mixed fill and stroke path in both matching color groups", () => {
    const imp = buildImport({
      paths: [
        {
          id: "p1",
          d: "M0 0",
          svgSource: "<path />",
          visible: true,
          hasFill: true,
          fillColor: "#ff0000",
          strokeColor: "#000000",
          sourceOutlineVisible: true,
          strokeEnabled: true,
        },
      ],
    });

    render(
      <ImportPathsList
        imp={imp}
        groupBy="color"
        expandedLayerKeys={new Set()}
        onSelectImport={() => {}}
        onToggleLayerCollapse={() => {}}
        onUpdateLayerVisibility={() => {}}
        onUpdatePathVisibility={() => {}}
        onUpdatePathFillEnabled={() => {}}
        onUpdatePathStroke={() => {}}
        onRemovePath={() => {}}
      />,
    );

    expect(screen.getByText("#000000")).toBeDefined();
    expect(screen.getByText("#ff0000")).toBeDefined();
  });

  it("shows generated no-stroke outlines in the black color group", () => {
    const onUpdatePathStroke = vi.fn();
    const imp = buildImport({
      generatedStrokeForNoStroke: true,
      paths: [
        {
          id: "p1",
          d: "M0 0",
          svgSource: "<path />",
          visible: true,
          hasFill: true,
          fillColor: "#ff0000",
          sourceOutlineVisible: false,
          strokeEnabled: true,
        },
      ],
    });

    render(
      <ImportPathsList
        imp={imp}
        groupBy="color"
        expandedLayerKeys={new Set(["imp-1:color:#000000"])}
        onSelectImport={() => {}}
        onToggleLayerCollapse={() => {}}
        onUpdateLayerVisibility={() => {}}
        onUpdatePathVisibility={() => {}}
        onUpdatePathFillEnabled={() => {}}
        onUpdatePathStroke={onUpdatePathStroke}
        onRemovePath={() => {}}
      />,
    );

    expect(screen.getByText("#000000")).toBeDefined();

    const blackGroupRow = screen.getByText("#000000").closest("div");
    expect(blackGroupRow).toBeTruthy();
    fireEvent.click(
      within(blackGroupRow as HTMLElement).getByTitle(
        "Toggle color group visibility",
      ),
    );
    expect(onUpdatePathStroke).toHaveBeenCalledWith("imp-1", "p1", false);
  });
});
