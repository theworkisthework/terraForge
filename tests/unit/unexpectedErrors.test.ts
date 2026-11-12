/**
 * The renderer's last line of reporting: unhandled rejections and uncaught
 * errors end up in the console panel and as one notification.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeError,
  installUnexpectedErrorHandlers,
  reportUnexpectedError,
  resetUnexpectedErrors,
  UNEXPECTED_ERROR_TASK_ID,
} from "@renderer/utils/unexpectedErrors";
import { useAppConfigStore } from "@renderer/store/appConfigStore";
import { useConsoleStore } from "@renderer/store/consoleStore";
import { useTaskStore } from "@renderer/store/taskStore";

const lines = () => useConsoleStore.getState().lines;
const tasks = () => Object.values(useTaskStore.getState().tasks);

beforeEach(() => {
  vi.useFakeTimers();
  resetUnexpectedErrors();
  useAppConfigStore.setState({ showConsoleTimestamps: false });
  useConsoleStore.setState({ lines: [] });
  useTaskStore.setState({ tasks: {} });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("describeError", () => {
  it.each([
    [new Error("disk full"), "disk full"],
    ["plain text", "plain text"],
    [{ code: 42 }, '{"code":42}'],
    [undefined, "Unknown error"],
    [null, "Unknown error"],
    [new Error(""), "Unknown error"],
  ])("describes %o as %s", (reason, expected) => {
    expect(describeError(reason)).toBe(expected);
  });

  it("drops the wrapper Electron puts around an IPC handler's error", () => {
    expect(describeError(new Error("Error invoking remote method 'fs:writeFile': Error: EACCES: permission denied"))).toBe(
      "EACCES: permission denied",
    );
    expect(describeError(new Error("Error invoking remote method 'fluidnc:listFiles': TypeError: fetch failed"))).toBe(
      "fetch failed",
    );
  });

  it("survives something that cannot be turned into JSON", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(describeError(loop)).toBe("[object Object]");
  });
});

describe("reportUnexpectedError", () => {
  it("writes a console line and raises a notification that stays", () => {
    reportUnexpectedError(new Error("disk full"));

    expect(lines()).toEqual(["[terraForge] Unexpected error: disk full"]);
    expect(tasks()).toEqual([
      {
        id: UNEXPECTED_ERROR_TASK_ID,
        type: "app-error",
        label: "Unexpected error — see console",
        progress: null,
        // Errors are not dismissed automatically.
        status: "error",
        error: "disk full",
      },
    ]);
  });

  it("keeps to one notification however many errors there are, with every one in the console", () => {
    reportUnexpectedError(new Error("first"));
    reportUnexpectedError(new Error("second"));

    expect(lines()).toHaveLength(2);
    expect(tasks()).toHaveLength(1);
    expect(tasks()[0].error).toBe("second");
  });

  it("does not repeat the same message straight away, but does later", () => {
    reportUnexpectedError(new Error("again"));
    vi.advanceTimersByTime(4000);
    reportUnexpectedError(new Error("again"));
    expect(lines()).toHaveLength(1);

    vi.advanceTimersByTime(6000);
    reportUnexpectedError(new Error("again"));
    expect(lines()).toHaveLength(2);
  });

  it.each([
    "ResizeObserver loop completed with undelivered notifications.",
    "ResizeObserver loop limit exceeded",
    "Error invoking remote method 'fluidnc:uploadFile': Error: Transfer cancelled",
    "Error invoking remote method 'fluidnc:downloadFile': Error: Download cancelled",
    "Upload cancelled",
  ])("says nothing about %s", (message) => {
    reportUnexpectedError(new Error(message));
    expect(lines()).toEqual([]);
    expect(tasks()).toEqual([]);
  });

  it("does not throw when it cannot report", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(useConsoleStore.getState(), "appendLine").mockImplementation(() => {
      throw new Error("console is broken");
    });
    expect(() => reportUnexpectedError(new Error("disk full"))).not.toThrow();
    expect(logged).toHaveBeenCalled();
  });
});

describe("installUnexpectedErrorHandlers", () => {
  let uninstall: () => void;
  beforeEach(() => {
    uninstall = installUnexpectedErrorHandlers();
  });
  afterEach(() => uninstall());

  /** jsdom has no PromiseRejectionEvent; all the handler reads is `reason`. */
  const rejection = (reason: unknown) => Object.assign(new Event("unhandledrejection"), { reason });

  it("reports a promise rejection that nothing handled", () => {
    window.dispatchEvent(rejection(new Error("Error invoking remote method 'fs:saveLayout': Error: EROFS: read-only")));
    expect(lines()).toEqual(["[terraForge] Unexpected error: EROFS: read-only"]);
    expect(tasks()[0].error).toBe("EROFS: read-only");
  });

  it("reports an error thrown outside rendering", () => {
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("x is not a function"), message: "Uncaught" }));
    expect(lines()).toEqual(["[terraForge] Unexpected error: x is not a function"]);
  });

  it("falls back to the event's message when there is no error object", () => {
    window.dispatchEvent(new ErrorEvent("error", { message: "Script error." }));
    expect(lines()).toEqual(["[terraForge] Unexpected error: Script error."]);
  });

  it("stops reporting once uninstalled", () => {
    uninstall();
    window.dispatchEvent(rejection(new Error("late")));
    expect(lines()).toEqual([]);
  });
});
