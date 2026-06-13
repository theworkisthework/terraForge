/**
 * CloseLayoutDialog
 *
 * Three-button variant of the project's styled modal, used when the user
 * closes a canvas layout that may have unsaved changes.
 *
 * Buttons (right-to-left visual order, left-to-right DOM order for tab flow):
 *   Cancel       — dismiss the dialog, leave the canvas untouched
 *   Don't Save   — discard without saving
 *   Save         — save then close (primary / accent action)
 */

import React from "react";
import { Button } from "./ui";

interface Props {
  /** Number of imported objects, used to build the message. */
  importCount: number;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function CloseLayoutDialog({
  importCount,
  onSave,
  onDiscard,
  onCancel,
}: Props) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-layout-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="bg-panel border border-border-ui rounded-lg shadow-2xl w-[340px] p-5 flex flex-col gap-4">
        <h2
          id="close-layout-dialog-title"
          className="text-white font-semibold text-base tracking-wide"
        >
          Close Layout
        </h2>

        <p className="text-sm text-content leading-relaxed">
          You have{" "}
          <span className="text-white font-medium">
            {importCount} object{importCount !== 1 ? "s" : ""}
          </span>{" "}
          on the canvas. Do you want to save the current layout before closing?
        </p>

        <div className="flex gap-2 justify-end mt-1">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onDiscard}>
            Exit without Saving
          </Button>
          <Button variant="primary" onClick={onSave} autoFocus>
            Save and Exit
          </Button>
        </div>
      </div>
    </div>
  );
}
