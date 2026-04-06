import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LayerGroup, SvgImport } from "../../../../../types";
import { UngroupedImportsSection } from "./UngroupedImportsSection";

const importA: SvgImport = {
  id: "imp-a",
  name: "A",
  paths: [],
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  visible: true,
  svgWidth: 100,
  svgHeight: 100,
  viewBoxX: 0,
  viewBoxY: 0,
};

const importB: SvgImport = {
  id: "imp-b",
  name: "B",
  paths: [],
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  visible: true,
  svgWidth: 100,
  svgHeight: 100,
  viewBoxX: 0,
  viewBoxY: 0,
};

const group1: LayerGroup = {
  id: "g-1",
  name: "Group 1",
  color: "#e94560",
  importIds: ["imp-a"],
};

describe("UngroupedImportsSection", () => {
  it("renders only imports not assigned to any group", () => {
    render(
      <UngroupedImportsSection
        imports={[importA, importB]}
        layerGroups={[group1]}
        dragOverGroupId={null}
        showUngroupedHint={false}
        onUngroupedDragOver={() => {}}
        onUngroupedDragLeave={() => {}}
        onUngroupedDrop={() => {}}
        renderImport={(imp: SvgImport): ReactNode => (
          <div key={imp.id} data-testid="rendered-import">
            {imp.name}
          </div>
        )}
      />,
    );

    const rendered = screen.getAllByTestId("rendered-import");
    expect(rendered).toHaveLength(1);
    expect(rendered[0].textContent).toBe("B");
  });

  it("passes through UngroupedDropZone children container", () => {
    render(
      <UngroupedImportsSection
        imports={[importB]}
        layerGroups={[]}
        dragOverGroupId={"none"}
        showUngroupedHint={true}
        onUngroupedDragOver={() => {}}
        onUngroupedDragLeave={() => {}}
        onUngroupedDrop={() => {}}
        renderImport={(imp: SvgImport): ReactNode => (
          <div key={imp.id} data-testid="rendered-import">
            {imp.name}
          </div>
        )}
      />,
    );

    expect(screen.getByTestId("rendered-import")).toBeTruthy();
  });
});
