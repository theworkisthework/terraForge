import { useState } from "react";
import { hasUnsavedChanges } from "../store/canvasStore/types";
import { useCanvasStore } from "../store/canvasStore";
import { useMachineStore } from "../store/machineStore";
import { sendJobControl } from "../features/machine/utils/jobControl";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "./ui";

interface AppCrashScreenProps {
  error: Error;
  /** Renders the app again. */
  onRetry: () => void;
}

type Control = "pause" | "abort";

const SENT: Record<Control, string> = {
  pause: "Pause sent.",
  abort: "Abort sent.",
};
const NOT_SENT: Record<Control, string> = {
  pause: "Pause was not sent. The machine may still be moving.",
  abort: "Abort was not sent. The machine may still be moving.",
};

/**
 * Pause and Abort for the connected machine. The machine does not stop
 * because the window broke, so the means to stop it has to survive too.
 *
 * `sendJobControl` reports a failure as a notification, which this screen
 * has replaced — hence the result line here.
 */
function MachineControls() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [confirmingAbort, setConfirmingAbort] = useState(false);

  const send = async (control: Control) => {
    setBusy(true);
    setResult(null);
    const sent = await sendJobControl(control);
    setResult(sent ? SENT[control] : NOT_SENT[control]);
    setBusy(false);
  };

  return (
    <section className="flex flex-col gap-2 border-t border-border-ui pt-4">
      <p className="text-xs text-content-muted">
        The machine is still connected. If a job is running it has not stopped.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void send("pause")}>
          Pause job
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => setConfirmingAbort(true)}>
          Abort job
        </Button>
      </div>
      {/* Always there, so that a result does not move the buttons. */}
      <p role="status" className="text-xs text-content-muted min-h-4">
        {result}
      </p>
      {confirmingAbort && (
        <ConfirmDialog
          title="Abort Job"
          message="Abort the current job? The machine will stop immediately and remaining moves will be cancelled."
          confirmLabel="Abort"
          onConfirm={() => {
            setConfirmingAbort(false);
            void send("abort");
          }}
          onCancel={() => setConfirmingAbort(false)}
        />
      )}
    </section>
  );
}

/**
 * Shown in place of the whole app when a render error got past every panel's
 * own boundary. The alternative is a blank window.
 *
 * The stores are not part of the React tree, so the layout is still in
 * memory: "Try again" renders the app from it, which is the way back to
 * saving it. Reloading the window starts from nothing.
 */
export function AppCrashScreen({ error, onRetry }: AppCrashScreenProps) {
  const connected = useMachineStore((s) => s.connected);
  const unsaved = useCanvasStore(hasUnsavedChanges);

  return (
    <div role="alert" className="h-screen w-screen bg-app text-content flex items-center justify-center p-6 overflow-auto">
      <div className="w-full max-w-lg bg-panel border border-border-ui rounded-lg shadow-2xl p-6 flex flex-col gap-4">
        <h1 className="text-base font-semibold tracking-wide">terraForge hit an error</h1>
        <p className="text-sm text-content-muted break-words">{error.message || "Unknown error"}</p>
        <p className="text-xs text-content-muted">
          {unsaved
            ? "Your layout has unsaved changes and is still in memory. Try again to get back to it and save; reloading the window discards it."
            : "Try again to carry on where you were. If the error comes back, reload the window."}
        </p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload window
          </Button>
        </div>

        {connected && <MachineControls />}

        {error.stack && (
          <details className="text-xs text-content-faint">
            <summary className="cursor-pointer select-none">Details</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px]">{error.stack}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
