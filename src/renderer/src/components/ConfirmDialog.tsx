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
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title = "Confirm",
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: Props) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter") onConfirm();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="bg-[#16213e] border border-[#0f3460] rounded-lg shadow-2xl w-[320px] p-5 flex flex-col gap-4">
        <h2
          id="confirm-dialog-title"
          className="text-white font-semibold text-base tracking-wide"
        >
          {title}
        </h2>

        <p className="text-sm text-gray-300 leading-relaxed">{message}</p>

        <div className="flex gap-2 justify-end mt-1">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded bg-[#0f3460] hover:bg-[#1a4a8a] transition-colors text-white"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded bg-[#e94560] hover:bg-[#c73d56] transition-colors text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
