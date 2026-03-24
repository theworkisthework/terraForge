import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CloseLayoutDialog } from "@renderer/components/CloseLayoutDialog";

describe("CloseLayoutDialog", () => {
  const defaultProps = {
    importCount: 3,
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dialog title", () => {
    render(<CloseLayoutDialog {...defaultProps} />);
    expect(screen.getByText("Close Layout")).toBeInTheDocument();
  });

  it("shows the import count in the message", () => {
    render(<CloseLayoutDialog {...defaultProps} importCount={5} />);
    expect(screen.getByText("5 objects")).toBeInTheDocument();
  });

  it("pluralises 'objects' for count > 1", () => {
    render(<CloseLayoutDialog {...defaultProps} importCount={3} />);
    expect(screen.getByText("3 objects")).toBeInTheDocument();
  });

  it("uses singular 'object' for count = 1", () => {
    render(<CloseLayoutDialog {...defaultProps} importCount={1} />);
    expect(screen.getByText("1 object")).toBeInTheDocument();
  });

  it("renders Cancel, Exit without Saving, and Save and Exit buttons", () => {
    render(<CloseLayoutDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exit without Saving" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save and Exit" }),
    ).toBeInTheDocument();
  });

  it("calls onSave when 'Save and Exit' is clicked", () => {
    const onSave = vi.fn();
    render(<CloseLayoutDialog {...defaultProps} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save and Exit" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("calls onDiscard when 'Exit without Saving' is clicked", () => {
    const onDiscard = vi.fn();
    render(<CloseLayoutDialog {...defaultProps} onDiscard={onDiscard} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Exit without Saving" }),
    );
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("calls onCancel when 'Cancel' is clicked", () => {
    const onCancel = vi.fn();
    render(<CloseLayoutDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel on Escape keydown", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <CloseLayoutDialog {...defaultProps} onCancel={onCancel} />,
    );
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.keyDown(backdrop, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when backdrop is clicked", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <CloseLayoutDialog {...defaultProps} onCancel={onCancel} />,
    );
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not call onCancel when inner card is clicked", () => {
    const onCancel = vi.fn();
    render(<CloseLayoutDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Close Layout"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("has role=dialog and aria-modal=true", () => {
    render(<CloseLayoutDialog {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
