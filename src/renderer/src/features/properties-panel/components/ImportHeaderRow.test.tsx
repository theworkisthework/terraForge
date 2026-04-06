import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SvgImport } from "../../../../types";
import { ImportHeaderRow } from "./ImportHeaderRow";

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
    paths: [{ id: "p1", d: "M0 0", svgSource: "<path />", visible: true }],
    ...patch,
  };
}

describe("ImportHeaderRow", () => {
  it("renders metadata and forwards primary actions", () => {
    const onSelectImport = vi.fn();
    const onToggleExpand = vi.fn();
    const onToggleVisibility = vi.fn();
    const onStartRename = vi.fn();
    const onEditingNameChange = vi.fn();
    const onCommitName = vi.fn();
    const onCancelName = vi.fn();
    const onDeleteImport = vi.fn();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();

    render(
      <ImportHeaderRow
        imp={buildImport()}
        indented={false}
        isExpanded={false}
        isEditingName={false}
        editingNameValue="sample"
        onSelectImport={onSelectImport}
        onToggleExpand={onToggleExpand}
        onToggleVisibility={onToggleVisibility}
        onStartRename={onStartRename}
        onEditingNameChange={onEditingNameChange}
        onCommitName={onCommitName}
        onCancelName={onCancelName}
        onDeleteImport={onDeleteImport}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />,
    );

    expect(screen.getByText("1p")).toBeDefined();

    fireEvent.click(screen.getByLabelText("Expand paths"));
    expect(onSelectImport).toHaveBeenCalledWith("imp-1");
    expect(onToggleExpand).toHaveBeenCalledWith("imp-1");

    fireEvent.click(screen.getByTitle("Toggle visibility"));
    expect(onToggleVisibility).toHaveBeenCalledWith("imp-1", false);

    fireEvent.doubleClick(screen.getByText("sample"));
    expect(onStartRename).toHaveBeenCalledWith("imp-1", "sample");

    fireEvent.click(screen.getByTitle("Delete import"));
    expect(onDeleteImport).toHaveBeenCalledWith("imp-1");
  });

  it("commits and cancels rename in edit mode", () => {
    const onCommitName = vi.fn();
    const onCancelName = vi.fn();

    render(
      <ImportHeaderRow
        imp={buildImport()}
        indented={false}
        isExpanded={true}
        isEditingName={true}
        editingNameValue="new name"
        onSelectImport={() => {}}
        onToggleExpand={() => {}}
        onToggleVisibility={() => {}}
        onStartRename={() => {}}
        onEditingNameChange={() => {}}
        onCommitName={onCommitName}
        onCancelName={onCancelName}
        onDeleteImport={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />,
    );

    const input = screen.getByDisplayValue("new name");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommitName).toHaveBeenCalledWith("imp-1", "new name");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancelName).toHaveBeenCalledTimes(1);
  });
});
