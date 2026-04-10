import { describe, expect, it, vi } from "vitest";
import type { SvgImport } from "../../../../types";
import { useImportHeaderRowModel } from "./useImportHeaderRowModel";

const imp: SvgImport = {
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
};

describe("useImportHeaderRowModel", () => {
  it("derives row class and dispatches row actions", () => {
    const onSelectImport = vi.fn();
    const onToggleExpand = vi.fn();
    const onToggleVisibility = vi.fn();
    const onStartRename = vi.fn();
    const onCommitName = vi.fn();
    const onDeleteImport = vi.fn();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();

    const model = useImportHeaderRowModel({
      imp,
      indented: true,
      editingNameValue: "rename",
      onSelectImport,
      onToggleExpand,
      onToggleVisibility,
      onStartRename,
      onCommitName,
      onDeleteImport,
      onDragStart,
      onDragEnd,
    });

    expect(model.rowClassName).toContain("pl-5 pr-2");

    model.onRowClick();
    expect(onSelectImport).toHaveBeenCalledWith("imp-1");

    model.onStartRename();
    expect(onStartRename).toHaveBeenCalledWith("imp-1", "sample");

    model.onCommitName();
    expect(onCommitName).toHaveBeenCalledWith("imp-1", "rename");

    const mouseEvent = { stopPropagation: vi.fn() } as any;
    model.onExpandClick(mouseEvent);
    expect(mouseEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onToggleExpand).toHaveBeenCalledWith("imp-1");

    model.onVisibilityClick(mouseEvent);
    expect(onToggleVisibility).toHaveBeenCalledWith("imp-1", false);

    model.onDeleteClick(mouseEvent);
    expect(onDeleteImport).toHaveBeenCalledWith("imp-1");

    const dragEvent = {} as any;
    model.onDragHandleStart(dragEvent);
    expect(onDragStart).toHaveBeenCalledWith(dragEvent, "imp-1");

    model.onDragHandleEnd();
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });
});
