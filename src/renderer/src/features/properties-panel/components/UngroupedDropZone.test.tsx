import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UngroupedDropZone } from "./UngroupedDropZone";

describe("UngroupedDropZone", () => {
  it("renders children and hint when enabled", () => {
    const onDragOver = vi.fn();
    const onDragLeave = vi.fn();
    const onDrop = vi.fn();

    const { container } = render(
      <UngroupedDropZone
        isDropTarget={true}
        showHint={true}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div>child row</div>
      </UngroupedDropZone>,
    );

    expect(screen.getByText("child row")).toBeDefined();
    expect(screen.getByText("Drop here to remove from group")).toBeDefined();

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("ring-accent/20");

    fireEvent.dragOver(root);
    expect(onDragOver).toHaveBeenCalledTimes(1);

    fireEvent.dragLeave(root);
    expect(onDragLeave).toHaveBeenCalledTimes(1);

    fireEvent.drop(root);
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it("hides hint when showHint is false", () => {
    render(
      <UngroupedDropZone
        isDropTarget={false}
        showHint={false}
        onDragOver={() => {}}
        onDragLeave={() => {}}
        onDrop={() => {}}
      >
        <div>child row</div>
      </UngroupedDropZone>,
    );

    expect(screen.queryByText("Drop here to remove from group")).toBeNull();
  });
});
