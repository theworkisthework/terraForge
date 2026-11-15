import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

/** Elements Tab would stop on — skips roving-tabindex items (tabIndex -1). */
function tabbable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0,
  );
}

/** Elements where Enter already means something: activate, newline, open. */
function handlesOwnEnter(target: EventTarget): boolean {
  return (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

interface ModalFocusOptions {
  /** Called on Escape. Omit to leave Escape doing nothing. */
  onEscape?: () => void;
  /**
   * Called on Enter, unless focus is on something that handles Enter itself
   * (a button, link, textarea, select) — a focused button activates natively,
   * so handling it here too would fire twice or fire the wrong action.
   */
  onEnter?: () => void;
}

/**
 * Keyboard and focus behaviour shared by modal dialogs. Bind `ref` and
 * `onKeyDown` to the element that contains the whole dialog.
 *
 * - On open, focus moves into the dialog: to the enabled element marked
 *   `data-autofocus`, else the first tabbable element, else the container.
 * - Tab / Shift+Tab cycle inside the dialog instead of walking out into the
 *   app behind the overlay.
 * - Key events stop at the dialog, so window-level shortcuts (canvas
 *   Delete/Escape/Space, flyout close) don't fire behind it.
 * - On close, focus returns to whatever had it before the dialog opened.
 *
 * Use `data-autofocus`, not React's `autoFocus`: under StrictMode the effect
 * cleanup runs once on mount and hands focus back to the opener, so the
 * focus-in has to live in the same effect to be re-applied after it.
 */
export function useModalFocus<T extends HTMLElement>({
  onEscape,
  onEnter,
}: ModalFocusOptions = {}) {
  const ref = useRef<T>(null);

  // Captured during the first render, before anything inside the dialog
  // has taken focus.
  const [previous] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const initial =
      container.querySelector<HTMLElement>("[data-autofocus]:not([disabled])") ??
      tabbable(container)[0] ??
      container;
    initial.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [previous]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Tab") {
        e.preventDefault();
        const focusable = ref.current ? tabbable(ref.current) : [];
        if (focusable.length === 0) return;
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        // From outside the list (e.g. the container itself), land on an end.
        const next =
          index === -1
            ? e.shiftKey
              ? focusable.length - 1
              : 0
            : (index + (e.shiftKey ? -1 : 1) + focusable.length) %
              focusable.length;
        focusable[next].focus();
      } else if (e.key === "Escape" && onEscape) {
        e.preventDefault();
        onEscape();
      } else if (e.key === "Enter" && onEnter && !handlesOwnEnter(e.target)) {
        e.preventDefault();
        onEnter();
      }
    },
    [onEscape, onEnter],
  );

  return { ref, onKeyDown };
}
