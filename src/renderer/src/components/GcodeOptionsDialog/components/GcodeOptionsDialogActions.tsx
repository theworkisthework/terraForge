import { Button } from "../../ui";
import type { ButtonProps } from "../../ui";

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
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={disabled}>
          Generate
        </Button>
      </div>
    </>
  );
}
