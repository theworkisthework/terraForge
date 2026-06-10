import { GcodeOptionsDialog } from "../GcodeOptionsDialog";
import { MachineConfigDialog } from "../MachineConfigDialog";
import { CloseLayoutDialog } from "../CloseLayoutDialog";
import { ConfirmDialog } from "../ConfirmDialog";
import { AboutDialog } from "../AboutDialog";
import type { GcodePrefs } from "../../features/gcode-options/gcodePrefs";
import type { CanvasLayout } from "../../../../types";

interface ToolbarDialogsProps {
  showGcodeDialog: boolean;
  showSettings: boolean;
  showAbout: boolean;
  showCloseDialog: boolean;
  pendingLayout: CanvasLayout | null;
  importCount: number;
  onGcodeConfirm: (prefs: GcodePrefs) => void;
  onGcodeCancel: () => void;
  onSettingsClose: () => void;
  onAboutClose: () => void;
  onCloseLayoutSave: () => void;
  onCloseLayoutDiscard: () => void;
  onCloseLayoutCancel: () => void;
  onPendingLayoutConfirm: () => void;
  onPendingLayoutCancel: () => void;
}

export function ToolbarDialogs({
  showGcodeDialog,
  showSettings,
  showAbout,
  showCloseDialog,
  pendingLayout,
  importCount,
  onGcodeConfirm,
  onGcodeCancel,
  onSettingsClose,
  onAboutClose,
  onCloseLayoutSave,
  onCloseLayoutDiscard,
  onCloseLayoutCancel,
  onPendingLayoutConfirm,
  onPendingLayoutCancel,
}: ToolbarDialogsProps) {
  return (
    <>
      {showGcodeDialog && (
        <GcodeOptionsDialog
          onConfirm={(prefs) => {
            onGcodeConfirm(prefs);
          }}
          onCancel={onGcodeCancel}
        />
      )}

      {showSettings && <MachineConfigDialog onClose={onSettingsClose} />}

      {showCloseDialog && (
        <CloseLayoutDialog
          importCount={importCount}
          onSave={onCloseLayoutSave}
          onDiscard={onCloseLayoutDiscard}
          onCancel={onCloseLayoutCancel}
        />
      )}

      {pendingLayout !== null && (
        <ConfirmDialog
          title="Replace Canvas?"
          message={`The canvas already has ${importCount} object${importCount !== 1 ? "s" : ""}. Opening this layout will replace it.\n\nContinue?`}
          confirmLabel="Replace"
          onConfirm={onPendingLayoutConfirm}
          onCancel={onPendingLayoutCancel}
        />
      )}

      {showAbout && <AboutDialog onClose={onAboutClose} />}
    </>
  );
}