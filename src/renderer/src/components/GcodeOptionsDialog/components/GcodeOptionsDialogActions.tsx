interface GcodeOptionsDialogActionsProps {
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function GcodeOptionsDialogActions({
  disabled,
  onCancel,
  onConfirm,
}: GcodeOptionsDialogActionsProps) {
  return (
    <>
      {disabled && (
        <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-2.5 py-1.5">
          Select at least one output destination - SD card upload or save to
          computer.
        </p>
      )}

      <div className="flex gap-2 justify-end mt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded bg-secondary hover:bg-secondary-hover transition-colors text-content"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={disabled}
          className="px-3 py-1.5 text-sm rounded bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white"
        >
          Generate
        </button>
      </div>
    </>
  );
}
