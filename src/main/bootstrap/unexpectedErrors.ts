/**
 * The last line of reporting for the main process: an exception nothing
 * caught, or a promise rejection nothing handled.
 *
 * The process keeps running afterwards, as it does under Electron's own
 * default handling. The app may be the only thing watching a plotter that is
 * mid-job, and a window that can still pause it is worth more than a clean
 * exit.
 *
 * The report goes to the window when there is one to show it, over the
 * channels the renderer already listens on — a line in the console panel and
 * a notification — and to an error box otherwise.
 */
import { dialog } from "electron";
import type { BackgroundTask } from "../../types";

/** The one notification these errors share, so that a burst cannot pile up. */
export const MAIN_ERROR_TASK_ID = "unexpected-error-main";

/** The same message again within this long is not shown again. */
const REPEAT_WINDOW_MS = 5000;

interface UnexpectedErrorOptions {
  safeSend: (channel: string, ...args: unknown[]) => void;
  /** Whether the window is there, and loaded, to show a report sent to it. */
  windowCanShow: () => boolean;
  /** The process to listen on. For tests. */
  target?: Pick<NodeJS.Process, "on" | "off">;
}

const messageOf = (reason: unknown): string => {
  const text = reason instanceof Error ? reason.message : String(reason);
  return text.trim() || "Unknown error";
};

/**
 * Starts reporting uncaught exceptions and unhandled rejections. Returns a
 * function that stops it.
 *
 * Call it before anything else that can fail. Note that listening for
 * `uncaughtException` replaces Electron's own error dialog, which is why
 * there is one here for when no window can take the report.
 */
export function registerUnexpectedErrorHandlers({
  safeSend,
  windowCanShow,
  target = process,
}: UnexpectedErrorOptions): () => void {
  let last = { message: "", at: 0 };

  const report = (kind: string, reason: unknown): void => {
    // Always, and in full: this is what a bug report will need.
    console.error(`${kind}:`, reason);
    try {
      const message = messageOf(reason);
      const now = Date.now();
      if (message === last.message && now - last.at < REPEAT_WINDOW_MS) return;
      last = { message, at: now };

      if (!windowCanShow()) {
        dialog.showErrorBox("terraForge hit an error", reason instanceof Error ? (reason.stack ?? message) : message);
        return;
      }
      const task: BackgroundTask = {
        id: MAIN_ERROR_TASK_ID,
        type: "app-error",
        label: "Unexpected error — see console",
        progress: null,
        status: "error",
        error: message,
      };
      safeSend("fluidnc:console", `[terraForge] Unexpected error: ${message}`);
      safeSend("task:update", task);
    } catch (err) {
      // An error from here would come straight back in as another one.
      console.error("Could not report an unexpected error", err);
    }
  };

  const onException = (err: Error) => report("Uncaught exception", err);
  const onRejection = (reason: unknown) => report("Unhandled rejection", reason);
  target.on("uncaughtException", onException);
  target.on("unhandledRejection", onRejection);
  return () => {
    target.off("uncaughtException", onException);
    target.off("unhandledRejection", onRejection);
  };
}
