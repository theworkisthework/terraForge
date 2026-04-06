import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PathRow } from "./PathRow";

describe("PathRow", () => {
  it("renders label and triggers toggle/remove callbacks", () => {
    const onToggleVisibility = vi.fn();
    const onRemove = vi.fn();

    render(
      <PathRow
        label="path 123abc"
        visible
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText("path 123abc")).toBeDefined();

    fireEvent.click(screen.getByLabelText("Hide path"));
    expect(onToggleVisibility).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("uses show-label when path is hidden", () => {
    render(
      <PathRow
        label="hidden"
        visible={false}
        onToggleVisibility={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByLabelText("Show path")).toBeDefined();
  });
});
