/**
 * Pause, resume and abort for the running job.
 *
 * These are the controls someone reaches for when a plot is going wrong, so
 * one that could not be sent must never pass silently: the failure is shown
 * as an error task (which stays up until dismissed) and written to the
 * console.
 */
import { v4 as uuid } from "uuid";
import { useTaskStore } from "../../../store/taskStore";
import { useConsoleStore } from "../../../store/consoleStore";

export type JobControl = "pause" | "resume" | "abort";

const CONTROLS: Record<JobControl, { send: () => Promise<void>; failed: string }> = {
  pause: {
    send: () => window.terraForge.fluidnc.pauseJob(),
    failed: "Pause was not sent — the machine may still be moving",
  },
  resume: {
    send: () => window.terraForge.fluidnc.resumeJob(),
    failed: "Resume was not sent",
  },
  abort: {
    send: () => window.terraForge.fluidnc.abortJob(),
    failed: "Abort was not sent — the machine may still be moving",
  },
};

/**
 * Sends a job control to the machine. Never rejects: resolves true once the
 * control was sent, or false after reporting why it was not.
 */
export async function sendJobControl(control: JobControl): Promise<boolean> {
  const { send, failed } = CONTROLS[control];
  try {
    await send();
    return true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    useTaskStore.getState().upsertTask({
      id: uuid(),
      type: "job-control",
      label: failed,
      progress: null,
      status: "error",
      error: reason,
    });
    useConsoleStore.getState().appendLine(`[terraForge] ${failed}: ${reason}`);
    return false;
  }
}
