import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyGroupDropHint } from "./EmptyGroupDropHint";

describe("EmptyGroupDropHint", () => {
  it("renders hint text", () => {
    render(<EmptyGroupDropHint isDropTarget={false} />);
    expect(screen.getByText("Drop layers here")).toBeDefined();
  });

  it("uses accent style when active drop target", () => {
    const { container } = render(<EmptyGroupDropHint isDropTarget={true} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("border-accent/50");
  });
});
