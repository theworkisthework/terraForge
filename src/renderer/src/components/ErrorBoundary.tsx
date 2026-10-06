import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered in place of the children once a render below has thrown. */
  fallback: (error: Error) => ReactNode;
  /** Called on capture — for logging; the boundary already handles display. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Contains a render error to one part of the UI instead of letting it unmount
 * the whole React root, which leaves the window blank.
 *
 * Use it around anything driven by data the app does not control — most
 * obviously bitmap renderer plugins, whose field schemas come from a
 * user-installed manifest. Manifests are validated before they get this far,
 * but validation and rendering are separate code paths and only one of them
 * is allowed to be wrong in a way the user can recover from.
 *
 * A boundary keeps showing its fallback until it is remounted, so give it a
 * `key` tied to whatever the user would change to recover (for a plugin, its
 * renderer id).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    console.error("Render error contained by ErrorBoundary:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    return error ? this.props.fallback(error) : this.props.children;
  }
}
