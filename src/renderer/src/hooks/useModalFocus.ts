import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus handling for a modal dialog:
 * - `trapTab` keeps Tab / Shift+Tab cycling inside the element bound to `ref`
 *   instead of walking out into the (inert-looking) app behind the overlay.
 * - On open, focus moves into the dialog: to the element marked
 *   `data-autofocus`, else the first focusable element, else the container.
 * - When the dialog unmounts, focus returns to whatever had it before it opened.
 *
 * Call `trapTab` from the dialog's onKeyDown. Use `data-autofocus` rather than
 * React's `autoFocus` inside the dialog: under StrictMode the effect's cleanup
 * runs once on mount and would hand focus straight back to the opener, so the
 * focus-in has to live in the same effect to be re-applied after it.
 */
export function useModalFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  // Captured during the first render, before anything inside the dialog
  // has taken focus.
  const [previous] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useEffect(() => {
    const container = ref.current;
    const initial =
      container?.querySelector<HTMLElement>("[data-autofocus]") ??
      container?.querySelector<HTMLElement>(FOCUSABLE) ??
      container;
    initial?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [previous]);

  const trapTab = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !ref.current) return;
    const focusable = Array.from(
      ref.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    e.preventDefault();
    if (focusable.length === 0) return;
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    const step = e.shiftKey ? -1 : 1;
    // From outside the list (e.g. the container itself), land on an end.
    const next =
      index === -1
        ? e.shiftKey
          ? focusable.length - 1
          : 0
        : (index + step + focusable.length) % focusable.length;
    focusable[next].focus();
  }, []);

  return { ref, trapTab };
}
