import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "@renderer/components/ConfirmDialog";

describe("ConfirmDialog", () => {
  const defaultProps = {
    message: "Are you sure?",
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with default title and message", () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("renders a custom title", () => {
    render(<ConfirmDialog {...defaultProps} title="Delete File?" />);
    expect(screen.getByText("Delete File?")).toBeInTheDocument();
  });

  it("renders the confirm button with default label 'OK'", () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });

  it("renders confirm button with custom label", () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmLabel="Replace"
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
  });

  it("hides the cancel button when onCancel is not provided", () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("shows the cancel button when onCancel is provided", () => {
    render(<ConfirmDialog {...defaultProps} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows cancel button with a custom cancelLabel", () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        cancelLabel="No thanks"
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "No thanks" }),
    ).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog message="Sure?" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog message="Sure?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onConfirm on Enter keydown", () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <ConfirmDialog message="Sure?" onConfirm={onConfirm} />,
    );
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.keyDown(backdrop, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel on Escape keydown when onCancel is provided", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(
      <ConfirmDialog
        message="Sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.keyDown(backdrop, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm on Escape keydown when onCancel is absent", () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <ConfirmDialog message="Sure?" onConfirm={onConfirm} />,
    );
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.keyDown(backdrop, { key: "Escape" });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when backdrop is clicked", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog message="Sure?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onConfirm when backdrop is clicked and onCancel is absent", () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <ConfirmDialog message="Sure?" onConfirm={onConfirm} />,
    );
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does not call onConfirm when inner card is clicked (not backdrop)", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog message="Sure?" onConfirm={onConfirm} />);
    // The message paragraph is inside the card — clicking it should not trigger backdrop handler
    fireEvent.click(screen.getByText("Sure?"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("has role=dialog and aria-modal=true", () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});

import { beforeEach } from "vitest";
