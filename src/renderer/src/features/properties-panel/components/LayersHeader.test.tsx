import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LayersHeader } from "./LayersHeader";

describe("LayersHeader", () => {
  it("renders only when show=true and triggers add action", () => {
    const onAddGroup = vi.fn();
    const { rerender } = render(
      <LayersHeader show={false} onAddGroup={onAddGroup} />,
    );

    expect(screen.queryByText("Layers")).toBeNull();

    rerender(<LayersHeader show onAddGroup={onAddGroup} />);
    expect(screen.getByText("Layers")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(onAddGroup).toHaveBeenCalledTimes(1);
  });
});
