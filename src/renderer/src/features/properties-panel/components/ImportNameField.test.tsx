import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportNameField } from "./ImportNameField";

describe("ImportNameField", () => {
  it("renders name text and starts rename on double click", () => {
    const onStartRename = vi.fn();

    render(
      <ImportNameField
        isEditingName={false}
        editingNameValue="sample"
        name="sample"
        onEditingNameChange={() => {}}
        onCommitName={() => {}}
        onCancelName={() => {}}
        onStartRename={onStartRename}
      />,
    );

    fireEvent.doubleClick(screen.getByText("sample"));
    expect(onStartRename).toHaveBeenCalledTimes(1);
  });

  it("forwards edit interactions in edit mode", () => {
    const onEditingNameChange = vi.fn();
    const onCommitName = vi.fn();
    const onCancelName = vi.fn();

    render(
      <ImportNameField
        isEditingName={true}
        editingNameValue="new name"
        name="sample"
        onEditingNameChange={onEditingNameChange}
        onCommitName={onCommitName}
        onCancelName={onCancelName}
        onStartRename={() => {}}
      />,
    );

    const input = screen.getByDisplayValue("new name");
    fireEvent.change(input, { target: { value: "next" } });
    expect(onEditingNameChange).toHaveBeenCalledWith("next");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommitName).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancelName).toHaveBeenCalledTimes(1);
  });
});
