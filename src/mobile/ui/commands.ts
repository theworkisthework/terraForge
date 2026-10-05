import { useSession } from "./session";

/** FluidNC/Grbl report failures in the HTTP body ("error:8 …", "ALARM:1") with a 200. */
const FAILURE = /(^|\n)\s*(error:|alarm:|\[msg:err)/i;

/**
 * Send a command, echoing it and the controller's reply into the Machine
 * tab's console. Throws if the reply reports an error, so callers can show it.
 */
export async function sendLogged(cmd: string): Promise<string> {
  const { appendLog } = useSession.getState();
  appendLog(`> ${cmd}`);
  let out: string;
  try {
    out = await window.terraForge.fluidnc.sendCommand(cmd);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog(`! ${msg}`);
    throw err;
  }
  const reply = out.trim();
  appendLog(reply || "(plotter replied with an empty body)");
  if (FAILURE.test(reply)) throw new Error(reply.split("\n")[0]);
  return out;
}
