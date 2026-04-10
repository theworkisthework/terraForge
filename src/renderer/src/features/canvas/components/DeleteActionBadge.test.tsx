import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeleteActionBadge } from "./DeleteActionBadge";

describe("DeleteActionBadge", () => {
  it("calls onDelete when clicked", () => {
    const onDelete = vi.fn();

    const { getByTestId } = render(
      <svg>
        <DeleteActionBadge
          dataTestId="delete-badge"
          x={10}
          y={20}
          onDelete={onDelete}
        />
      </svg>,
    );

    fireEvent.click(getByTestId("delete-badge"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("stops click propagation to parent svg group", () => {
    const onDelete = vi.fn();
    const onParentClick = vi.fn();

    const { getByTestId } = render(
      <svg>
        <g data-testid="parent" onClick={onParentClick}>
          <DeleteActionBadge
            dataTestId="delete-badge"
            x={0}
            y={0}
            onDelete={onDelete}
          />
        </g>
      </svg>,
    );

    fireEvent.click(getByTestId("delete-badge"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
