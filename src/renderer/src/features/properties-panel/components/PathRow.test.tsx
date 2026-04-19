import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PathRow } from "./PathRow";

describe("PathRow", () => {
  it("renders label and triggers toggle/remove callbacks", () => {
    const onToggleVisibility = vi.fn();
    const onToggleStroke = vi.fn();
    const onRemove = vi.fn();

    render(
      <PathRow
        label="path 123abc"
        visible
        strokeEnabled
        strokeAvailable
        onToggleVisibility={onToggleVisibility}
        onToggleStroke={onToggleStroke}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText("path 123abc")).toBeDefined();

    fireEvent.click(screen.getByLabelText("Hide path"));
    expect(onToggleVisibility).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Disable path stroke"));
    expect(onToggleStroke).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("uses show-label when path is hidden", () => {
    render(
      <PathRow
        label="hidden"
        visible={false}
        strokeEnabled={false}
        strokeAvailable={false}
        onToggleVisibility={() => {}}
        onToggleStroke={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByLabelText("Show path")).toBeDefined();
    expect(screen.getByLabelText("Enable path stroke")).toBeDisabled();
  });
});
