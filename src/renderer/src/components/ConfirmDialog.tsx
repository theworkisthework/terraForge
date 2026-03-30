/**
 * ConfirmDialog
 *
 * A minimal styled confirmation modal that matches the terraForge design
 * language. Prefer this over `window.confirm()` so the prompt stays
 * within the app's dark theme.
 *
 * Usage:
 *   <ConfirmDialog
 *     title="Replace Toolpath?"
 *     message={`Replace the current toolpath with "${name}"?`}
 *     confirmLabel="Replace"
 *     onConfirm={handleConfirm}
 *     onCancel={handleCancel}
 *   />
 */

import React from "react";

interface Props {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "warning" adds an orange icon bar and styles the confirm button in orange. */
  variant?: "default" | "warning";
  onConfirm: () => void;
  /** When omitted the Cancel button is hidden — dialog acts as a single-button alert. */
  onCancel?: () => void;
}

export function ConfirmDialog({
  title = "Confirm",
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: Props) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") (onCancel ?? onConfirm)();
    if (e.key === "Enter") onConfirm();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) (onCancel ?? onConfirm)();
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className={`bg-panel border rounded-lg shadow-2xl w-[320px] flex flex-col overflow-hidden ${
        variant === "warning" ? "border-orange-500/50" : "border-border-ui"
      }`}>
        {variant === "warning" && (
          <div className="flex items-center gap-2 px-5 py-3 bg-orange-500/10 border-b border-orange-500/30">
            <span className="text-orange-400 text-base leading-none">⚠</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">
              Warning
            </span>
          </div>
        )}
        <div className="p-5 flex flex-col gap-4">
        <h2
          id="confirm-dialog-title"
          className="text-content font-semibold text-base tracking-wide"
        >
          {title}
        </h2>

        <p className="text-sm text-content leading-relaxed whitespace-pre-wrap">
          {message}
        </p>

        <div className="flex gap-2 justify-end mt-1">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm rounded bg-secondary hover:bg-secondary-hover transition-colors text-content"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded transition-colors text-white bg-accent hover:bg-accent-hover"
          >
            {confirmLabel}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
