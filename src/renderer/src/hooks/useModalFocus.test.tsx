import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useModalFocus } from "./useModalFocus";

function Harness({
  onEscape,
  onEnter,
  children,
}: {
  onEscape?: () => void;
  onEnter?: () => void;
  children: React.ReactNode;
}) {
  const { ref, onKeyDown } = useModalFocus<HTMLDivElement>({
    onEscape,
    onEnter,
  });
  return (
    <div ref={ref} role="dialog" tabIndex={-1} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

describe("useModalFocus", () => {
  it("skips roving-tabindex items when cycling with Tab", () => {
    render(
      <Harness>
        <button>Active tab</button>
        <button tabIndex={-1}>Inactive tab</button>
        <button>Close</button>
      </Harness>,
    );
    const active = screen.getByRole("button", { name: "Active tab" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(active).toHaveFocus();
    fireEvent.keyDown(active, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(active).toHaveFocus();
  });

  it("falls back to the first tabbable element when the autofocus target is disabled", () => {
    render(
      <Harness>
        <button>First</button>
        <button disabled data-autofocus>
          Generate
        </button>
      </Harness>,
    );
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("focuses the container when nothing inside is tabbable", () => {
    render(
      <Harness>
        <p>Just text</p>
      </Harness>,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("runs onEnter from text inputs but not from links, textareas or selects", () => {
    const onEnter = vi.fn();
    render(
      <Harness onEnter={onEnter}>
        <input aria-label="name" />
        <a href="https://example.com">link</a>
        <textarea aria-label="notes" />
        <select aria-label="pick">
          <option>a</option>
        </select>
      </Harness>,
    );
    fireEvent.keyDown(screen.getByRole("link"), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("notes"), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("pick"), { key: "Enter" });
    expect(onEnter).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("name"), { key: "Enter" });
    expect(onEnter).toHaveBeenCalledOnce();
  });

  it("leaves Escape alone when no onEscape is given, but still contains it", () => {
    const windowKeyDown = vi.fn();
    window.addEventListener("keydown", windowKeyDown);
    try {
      render(
        <Harness>
          <button>Close</button>
        </Harness>,
      );
      fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
      expect(windowKeyDown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", windowKeyDown);
    }
  });
});
