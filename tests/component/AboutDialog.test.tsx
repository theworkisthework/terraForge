import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AboutDialog } from "@renderer/components/AboutDialog";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AboutDialog", () => {
  it("renders the dialog with title and subtitle", async () => {
    await act(async () => {
      render(<AboutDialog onClose={() => {}} />);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("terraForge")).toBeInTheDocument();
    expect(screen.getByText("terraPen plotter control")).toBeInTheDocument();
  });

  it("shows version returned by app.getVersion", async () => {
    (
      window.terraForge.app.getVersion as ReturnType<typeof vi.fn>
    ).mockResolvedValue("2.3.1");
    render(<AboutDialog onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("2.3.1")).toBeInTheDocument());
  });

  it("shows 'unknown' when app.getVersion rejects", async () => {
    (
      window.terraForge.app.getVersion as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("IPC error"));
    render(<AboutDialog onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("unknown")).toBeInTheDocument(),
    );
  });

  it("renders license and copyright text", async () => {
    await act(async () => {
      render(<AboutDialog onClose={() => {}} />);
    });
    expect(
      screen.getByText("Released under the MIT License."),
    ).toBeInTheDocument();
    expect(screen.getByText("© 2026 Mark Benson")).toBeInTheDocument();
    expect(screen.getByText(/THEWORKISTHEWORK/)).toBeInTheDocument();
  });

  it("calls onClose when Close button is clicked", async () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape key is pressed", async () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders a link to the GitHub repo", async () => {
    await act(async () => {
      render(<AboutDialog onClose={() => {}} />);
    });
    const link = screen.getByRole("link", {
      name: /github\.com\/theworkisthework\/terraForge/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/theworkisthework/terraForge",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);
    // The outermost div is the backdrop
    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
