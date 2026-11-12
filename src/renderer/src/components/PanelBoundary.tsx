import type { ReactNode } from "react";
import { useConsoleStore } from "../store/consoleStore";
import { ErrorBoundary } from "./ErrorBoundary";
import { Button } from "./ui";

/**
 * How the fallback is laid out, to suit the space the panel has:
 * - `panel`: stacked and centred, for a side panel or the canvas.
 * - `row`: one line, for a strip such as the toolbar or the console.
 * - `icon`: a single button, for the 36 px collapsed side strip.
 */
type PanelShape = "panel" | "row" | "icon";

interface PanelBoundaryProps {
  /** What the user would call this part of the window: "file browser". */
  name: string;
  shape?: PanelShape;
  /**
   * Classes for the fallback's own box: whatever the panel's root element
   * would have supplied (size, border, position), so that the fallback takes
   * the panel's place without moving anything around it.
   */
  className?: string;
  children: ReactNode;
}

interface FallbackProps {
  name: string;
  shape: PanelShape;
  className: string;
  error: Error;
  onRetry: () => void;
}

function PanelFallback({ name, shape, className, error, onRetry }: FallbackProps) {
  const heading = `The ${name} hit an error.`;
  const detail = error.message || "Unknown error";

  if (shape === "icon") {
    return (
      <div role="alert" className={className}>
        <button
          type="button"
          aria-label={`${heading} Retry`}
          title={`${heading} Click to retry.\n${detail}`}
          onClick={(e) => {
            // The collapsed strip is itself a button, which opens the panel.
            e.stopPropagation();
            onRetry();
          }}
          className="h-6 w-6 inline-flex items-center justify-center rounded border border-accent/50 text-accent text-xs font-bold hover:bg-secondary transition-colors"
        >
          !
        </button>
      </div>
    );
  }

  if (shape === "row") {
    return (
      <div role="alert" className={`flex items-center gap-3 min-w-0 overflow-hidden ${className}`}>
        <span className="text-xs text-content shrink-0">{heading}</span>
        <span className="text-[10px] text-content-faint truncate min-w-0 flex-1" title={detail}>
          {detail}
        </span>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={`h-full w-full overflow-hidden flex flex-col items-center justify-center gap-2 p-3 text-center ${className}`}
    >
      <span className="text-xs text-content">{heading}</span>
      <span className="text-[10px] text-content-faint break-words line-clamp-3 max-w-full" title={detail}>
        {detail}
      </span>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/**
 * Keeps a render error inside one panel of the window. The panel is replaced
 * by a short message with a Retry button; everything else — the job controls
 * above all — carries on working.
 *
 * Retry renders the panel again from the stores, which a render error does
 * not touch. If whatever broke it is still there it will fail again, and say
 * so again.
 */
export function PanelBoundary({ name, shape = "panel", className = "", children }: PanelBoundaryProps) {
  return (
    <ErrorBoundary
      onError={(error) =>
        useConsoleStore.getState().appendLine(`[terraForge] The ${name} hit an error: ${error.message || "Unknown error"}`)
      }
      fallback={(error, reset) => (
        <PanelFallback name={name} shape={shape} className={className} error={error} onRetry={reset} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
