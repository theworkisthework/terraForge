import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Breadcrumb } from "./Breadcrumb";

describe("Breadcrumb", () => {
  it("shows a single slash at the root", () => {
    const { container } = render(<Breadcrumb path="/" navigate={vi.fn()} />);
    expect(container.textContent).toBe("/");
  });

  it("shows one slash before a top-level folder, not two (#163)", () => {
    const { container } = render(
      <Breadcrumb path="/plotropolis-58670" navigate={vi.fn()} />,
    );
    expect(container.textContent).toBe("/plotropolis-58670");
  });

  it("separates nested folders with single slashes", () => {
    const { container } = render(<Breadcrumb path="/a/b/c" navigate={vi.fn()} />);
    expect(container.textContent).toBe("/a/b/c");
  });

  it("navigates to the root and to each ancestor", () => {
    const navigate = vi.fn();
    render(<Breadcrumb path="/a/b" navigate={navigate} />);

    fireEvent.click(screen.getByRole("button", { name: "Root folder" }));
    fireEvent.click(screen.getByRole("button", { name: "a" }));
    fireEvent.click(screen.getByRole("button", { name: "b" }));

    expect(navigate.mock.calls).toEqual([["/"], ["/a"], ["/a/b"]]);
  });

  it("does not colour the root with the accent", () => {
    render(<Breadcrumb path="/a" navigate={vi.fn()} />);
    const root = screen.getByRole("button", { name: "Root folder" });
    expect(root.className).not.toMatch(/accent/);
  });
});
