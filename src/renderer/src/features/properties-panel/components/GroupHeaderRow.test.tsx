import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LayerGroup } from "../../../../types";
import { GroupHeaderRow } from "./GroupHeaderRow";

function buildGroup(patch: Partial<LayerGroup> = {}): LayerGroup {
  return {
    id: "g1",
    name: "Group 1",
    color: "#ff0000",
    importIds: ["imp-1"],
    ...patch,
  };
}

describe("GroupHeaderRow", () => {
  it("renders and forwards group actions", () => {
    const onToggleSelect = vi.fn();
    const onDragOverGroup = vi.fn();
    const onDragLeaveGroup = vi.fn();
    const onDropGroup = vi.fn();
    const onToggleCollapse = vi.fn();
    const onUpdateGroupColor = vi.fn();
    const onStartEditName = vi.fn();
    const onEditingNameChange = vi.fn();
    const onCommitName = vi.fn();
    const onCancelEditName = vi.fn();
    const onRemoveGroup = vi.fn();

    render(
      <GroupHeaderRow
        group={buildGroup()}
        isCollapsed={false}
        isDropTarget={false}
        isSelected={false}
        membersCount={3}
        isEditingName={false}
        editingNameValue="Group 1"
        onToggleSelect={onToggleSelect}
        onDragOverGroup={onDragOverGroup}
        onDragLeaveGroup={onDragLeaveGroup}
        onDropGroup={onDropGroup}
        onToggleCollapse={onToggleCollapse}
        onUpdateGroupColor={onUpdateGroupColor}
        onStartEditName={onStartEditName}
        onEditingNameChange={onEditingNameChange}
        onCommitName={onCommitName}
        onCancelEditName={onCancelEditName}
        onRemoveGroup={onRemoveGroup}
      />,
    );

    fireEvent.click(screen.getByLabelText("Collapse group"));
    expect(onToggleCollapse).toHaveBeenCalledWith("g1");

    fireEvent.change(screen.getByTitle("Group colour"), {
      target: { value: "#00ff00" },
    });
    expect(onUpdateGroupColor).toHaveBeenCalledWith("g1", "#00ff00");

    fireEvent.doubleClick(screen.getByText("Group 1"));
    expect(onStartEditName).toHaveBeenCalledWith("g1", "Group 1");

    fireEvent.click(screen.getByText("3"));
    expect(onToggleSelect).toHaveBeenCalledWith("g1");

    fireEvent.click(
      screen.getByTitle("Delete group (layers become ungrouped)"),
    );
    expect(onRemoveGroup).toHaveBeenCalledWith("g1");
  });

  it("commits and cancels rename in editing mode", () => {
    const onCommitName = vi.fn();
    const onCancelEditName = vi.fn();

    render(
      <GroupHeaderRow
        group={buildGroup()}
        isCollapsed={true}
        isDropTarget={false}
        isSelected={true}
        membersCount={1}
        isEditingName={true}
        editingNameValue="Renamed"
        onToggleSelect={() => {}}
        onDragOverGroup={() => {}}
        onDragLeaveGroup={() => {}}
        onDropGroup={() => {}}
        onToggleCollapse={() => {}}
        onUpdateGroupColor={() => {}}
        onStartEditName={() => {}}
        onEditingNameChange={() => {}}
        onCommitName={onCommitName}
        onCancelEditName={onCancelEditName}
        onRemoveGroup={() => {}}
      />,
    );

    const input = screen.getByDisplayValue("Renamed");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommitName).toHaveBeenCalledWith("g1", "Renamed");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancelEditName).toHaveBeenCalledTimes(1);
  });
});
