/**
 * The main process's last line of reporting: an uncaught exception or an
 * unhandled rejection goes to the window when it can show it, and to an
 * error box when it cannot.
 */
import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ showErrorBox: vi.fn() }));
vi.mock("electron", () => ({ dialog: { showErrorBox: mocks.showErrorBox } }));

import { MAIN_ERROR_TASK_ID, registerUnexpectedErrorHandlers } from "../../../src/main/bootstrap/unexpectedErrors";

let proc: EventEmitter;
let safeSend: ReturnType<typeof vi.fn<(channel: string, ...args: unknown[]) => void>>;
let windowUp: boolean;
let stop: () => void;

const sentOn = (channel: string) => safeSend.mock.calls.filter(([c]) => c === channel).map(([, payload]) => payload);

beforeEach(() => {
  vi.useFakeTimers();
  proc = new EventEmitter();
  safeSend = vi.fn();
  windowUp = true;
  mocks.showErrorBox.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  stop = registerUnexpectedErrorHandlers({ safeSend, windowCanShow: () => windowUp, target: proc as never });
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("main-process unexpected errors", () => {
  it("sends an uncaught exception to the window as a console line and a notification", () => {
    const err = new Error("ENOSPC: no space left on device");
    proc.emit("uncaughtException", err);

    expect(sentOn("fluidnc:console")).toEqual(["[terraForge] Unexpected error: ENOSPC: no space left on device"]);
    expect(sentOn("task:update")).toEqual([
      {
        id: MAIN_ERROR_TASK_ID,
        type: "app-error",
        label: "Unexpected error — see console",
        progress: null,
        status: "error",
        error: "ENOSPC: no space left on device",
      },
    ]);
    expect(mocks.showErrorBox).not.toHaveBeenCalled();
    // And in full to the terminal, for a bug report.
    expect(console.error).toHaveBeenCalledWith("Uncaught exception:", err);
  });

  it("does the same for a promise rejection nothing handled", () => {
    proc.emit("unhandledRejection", new Error("socket hang up"), Promise.resolve());
    expect(sentOn("fluidnc:console")).toEqual(["[terraForge] Unexpected error: socket hang up"]);
    expect(sentOn("task:update")).toHaveLength(1);
  });

  it("copes with a rejection that is not an Error", () => {
    proc.emit("unhandledRejection", "just a string");
    proc.emit("unhandledRejection", undefined);
    expect(sentOn("fluidnc:console")).toEqual([
      "[terraForge] Unexpected error: just a string",
      "[terraForge] Unexpected error: undefined",
    ]);
  });

  it("shows an error box, with the stack, when there is no window to tell", () => {
    windowUp = false;
    const err = new Error("could not read settings");
    proc.emit("uncaughtException", err);

    expect(mocks.showErrorBox).toHaveBeenCalledWith("terraForge hit an error", err.stack);
    expect(safeSend).not.toHaveBeenCalled();
  });

  it("does not repeat the same message straight away, but does later", () => {
    proc.emit("uncaughtException", new Error("again"));
    vi.advanceTimersByTime(4000);
    proc.emit("uncaughtException", new Error("again"));
    expect(sentOn("task:update")).toHaveLength(1);
    // Every one still reaches the terminal.
    expect(console.error).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(6000);
    proc.emit("uncaughtException", new Error("again"));
    expect(sentOn("task:update")).toHaveLength(2);
  });

  it("does not throw when it cannot report", () => {
    safeSend.mockImplementation(() => {
      throw new Error("Object has been destroyed");
    });
    expect(() => proc.emit("uncaughtException", new Error("first"))).not.toThrow();
    expect(console.error).toHaveBeenCalledWith("Could not report an unexpected error", expect.any(Error));
  });

  it("stops listening when asked", () => {
    stop();
    expect(proc.listenerCount("uncaughtException")).toBe(0);
    expect(proc.listenerCount("unhandledRejection")).toBe(0);
  });
});
