/**
 * The last line of reporting, for failures that nothing was handling: a
 * rejected promise with no catch, or an error thrown from an event handler
 * or a timer. Left alone these only reach the DevTools console, and the
 * user is left with a button that did nothing.
 *
 * Render errors do not come this way: an ErrorBoundary catches those.
 */
import { useConsoleStore } from "../store/consoleStore";
import { useTaskStore } from "../store/taskStore";

/** The one notification these errors share, so that a burst cannot pile up. */
export const UNEXPECTED_ERROR_TASK_ID = "unexpected-error";

/** The same message again within this long is not reported again. */
const REPEAT_WINDOW_MS = 5000;

const IGNORED: readonly RegExp[] = [
  // Chromium's note that a ResizeObserver callback caused another layout
  // pass. Nothing has gone wrong.
  /^ResizeObserver loop/,
  // A transfer the user cancelled. Its own task already says so.
  /^(Transfer|Upload|Download) cancelled$/,
];

/** What went wrong, as one line of text. */
export function describeError(reason: unknown): string {
  let text: string;
  if (reason instanceof Error) text = reason.message;
  else if (typeof reason === "string") text = reason;
  else if (reason === undefined || reason === null) text = "";
  else {
    try {
      text = JSON.stringify(reason) ?? String(reason);
    } catch {
      text = String(reason);
    }
  }
  // Electron wraps whatever an IPC handler threw in a line of its own.
  text = text.replace(/^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/, "").trim();
  return text || "Unknown error";
}

let last = { message: "", at: 0 };

/**
 * Reports an error nothing else handled: a line in the console panel, and a
 * notification pointing at it. Never throws.
 */
export function reportUnexpectedError(reason: unknown): void {
  try {
    const message = describeError(reason);
    if (IGNORED.some((pattern) => pattern.test(message))) return;
    const now = Date.now();
    if (message === last.message && now - last.at < REPEAT_WINDOW_MS) return;
    last = { message, at: now };

    useConsoleStore.getState().appendLine(`[terraForge] Unexpected error: ${message}`);
    useTaskStore.getState().upsertTask({
      id: UNEXPECTED_ERROR_TASK_ID,
      type: "app-error",
      label: "Unexpected error — see console",
      progress: null,
      status: "error",
      error: message,
    });
  } catch (err) {
    // An error from here would come straight back in as another one.
    console.error("Could not report an unexpected error", err, reason);
  }
}

/** Forgets the last message reported. For tests. */
export function resetUnexpectedErrors(): void {
  last = { message: "", at: 0 };
}

/**
 * Starts reporting unhandled promise rejections and uncaught errors in this
 * window. Returns a function that stops it.
 */
export function installUnexpectedErrorHandlers(target: Window = window): () => void {
  const onRejection = (event: PromiseRejectionEvent) => reportUnexpectedError(event.reason);
  const onError = (event: ErrorEvent) => reportUnexpectedError(event.error ?? event.message);
  target.addEventListener("unhandledrejection", onRejection);
  target.addEventListener("error", onError);
  return () => {
    target.removeEventListener("unhandledrejection", onRejection);
    target.removeEventListener("error", onError);
  };
}
