import { useEffect, useRef, useState } from "react";
import {
  createBedMeshPoints,
  MAX_BED_MESH_GRID_POINTS,
  supportsBedMeshZCompensation,
} from "../../../../../../types/bedMesh";
import type { BedMesh, BedMeshPoint, MachineStatus } from "../../../../../../types";
import { useMachineStore } from "../../../../store/machineStore";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";

const STATUS_TIMEOUT_MS = 10_000;

/** Where the calibration wizard is. "closed" means no wizard is showing. */
export type BedMeshWizardStep = "closed" | "grid" | "origin" | "probe" | "review";

/**
 * How the user establishes X0 Y0 before probing: run the homing cycle
 * (machines with end stops) or jog to a point and set it as zero
 * (machines without).
 */
export type BedMeshOriginMethod = "home" | "jog";

/**
 * Where work X0 Y0 is after homing. Homing only sets machine position; the
 * work offset (G54) is whatever was stored before — possibly set while the
 * machine was unhomed, which puts X0 Y0 somewhere arbitrary.
 *  - "at-home": X0 Y0 is the homed position.
 *  - "offset": X0 Y0 is (dx, dy) mm from the homed position.
 *  - "unknown": no work offset has been reported yet, so it can't be told.
 */
export type BedMeshHomeCheck =
  | { kind: "at-home" }
  | { kind: "offset"; dx: number; dy: number }
  | { kind: "unknown" };

/** Within this, X0 Y0 counts as the homed position. */
const AT_HOME_TOLERANCE_MM = 0.05;

/**
 * How long the status stream must stay quiet, after a command, before an
 * idle machine is taken to have finished. FluidNC auto-reports ($RI=500)
 * only when something changes, so a command that doesn't move anything —
 * e.g. "go to X0 Y0" when already there — produces no report at all.
 * Motion that does start is reported within one 500 ms interval.
 */
const QUIET_IDLE_MS = 1_500;

/*
 * Z offsets are measured from machine position (MPos), not WPos. Reports
 * carry WCO only every so often, and the status parser falls back to MPos
 * when it's absent, so status.wpos can jump by the work offset between
 * reports. Offsets are relative to the first point, so MPos is exact.
 */
function isValidIdleStatus(status: MachineStatus | null | undefined): status is MachineStatus {
  return !!status &&
    status.state === "Idle" &&
    Number.isFinite(status.mpos.x) &&
    Number.isFinite(status.mpos.y) &&
    Number.isFinite(status.mpos.z);
}

/**
 * Asks the machine for a status report ("?"). FluidNC 4.1 doesn't
 * auto-report every state change — e.g. Home → Idle at the same position —
 * so the last report can be stale. The reply updates the machine store.
 * Best effort: older firmware may not answer "?" over HTTP, which leaves
 * the auto-reports to go on.
 */
async function refreshStatus(): Promise<MachineStatus | null> {
  const { configs, activeConfigId } = useMachineStore.getState();
  const active = configs.find((c) => c.id === activeConfigId);
  // USB (serial) polls "?" itself, and a "?" line gets no "ok" there — it would
  // hold the serial queue until it timed out.
  if (active?.connection.type === "usb") return useMachineStore.getState().status;
  try {
    await window.terraForge.fluidnc.sendCommand("?");
  } catch {
    // Keep the last report.
  }
  return useMachineStore.getState().status;
}

/** The machine's status, which must be Idle — asking afresh if the last report isn't. */
async function requireCurrentIdleStatus(): Promise<MachineStatus> {
  let status = useMachineStore.getState().status;
  if (!isValidIdleStatus(status)) status = await refreshStatus();
  if (!isValidIdleStatus(status)) {
    const state = (status as MachineStatus | null)?.state;
    throw new Error(
      state && state !== "Idle"
        ? `The machine reports ${state}. Wait for it to be Idle and try again.`
        : "Wait for a valid idle machine status before continuing.",
    );
  }
  return status;
}

/**
 * Homing runs from Idle, or from the Alarm a machine with end stops starts
 * in. A leftover Home is let through too: it's the state most likely to be
 * stale, and FluidNC itself refuses $H while a cycle is really running.
 */
async function requireReadyToHome(): Promise<void> {
  let status = useMachineStore.getState().status;
  const ready = (s: MachineStatus | null) =>
    s?.state === "Idle" || s?.state === "Alarm" || s?.state === "Home";
  if (!ready(status)) status = await refreshStatus();
  if (!ready(status)) {
    throw new Error(
      `The machine reports ${status?.state ?? "no status"}. Wait for it to stop and try again.`,
    );
  }
}

/**
 * Probing goes back and forth along the rows (an S, or "boustrophedon"):
 * left to right on the first row, right to left on the next, and so on, so
 * each move is to a neighbouring point instead of back across the bed.
 * Points are still stored in grid order (row by row, left to right), so
 * this maps probe step ↔ grid index. It is its own inverse.
 */
export function serpentineIndex(i: number, xPoints: number): number {
  const row = Math.floor(i / xPoints);
  const col = i % xPoints;
  return row * xPoints + (row % 2 === 1 ? xPoints - 1 - col : col);
}

/** How far above the first probe point's touch height the pen travels. */
const TRAVEL_CLEARANCE_MM = 5;

/**
 * Lifts the pen to travel height. `up` is -1 on machines whose Z jog is
 * inverted. Never a blind "up 5 mm": a pen that's already high would hit the
 * top of the Z axis, and repeated lifts would climb.
 *
 * - Once the first point is recorded: TRAVEL_CLEARANCE_MM above where the
 *   pen touched it (`datumZ`, machine Z). (Measuring from the highest touch
 *   would climb: a reading taken without lowering the pen is itself at
 *   travel height.)
 * - Before that: back to `startZ`, the height probing started from, which
 *   the user made sure was clear of the bed in the origin step.
 *
 * The pen is never lowered to reach travel height, and isn't moved if it's
 * already there. With neither height known (not probing) it doesn't move.
 *
 * One line, in machine coordinates (G53 applies to that line only), so the
 * lift leaves no modal state behind. A relative lift needs a second line to
 * restore G90, and FluidNC 4.1 refuses HTTP commands while the machine is
 * moving (503 "Try again when not moving") — that second line arrives
 * mid-lift.
 */
async function retractZ(
  up: 1 | -1,
  datumZ: number | null,
  startZ: number | null,
): Promise<void> {
  const travel = datumZ !== null ? datumZ + TRAVEL_CLEARANCE_MM * up : startZ;
  if (travel === null) return;
  const z = useMachineStore.getState().status?.mpos.z;
  if (typeof z !== "number" || !Number.isFinite(z)) {
    throw new Error("The machine's Z position is unknown, so the pen can't be lifted.");
  }
  const target = up * Math.max(up * z, up * travel);
  if (Math.abs(target - z) < 0.001) return; // already clear
  await sendCommandsAndWaitForIdle(`G21 G53 G0 Z${target.toFixed(3)}`);
}

/** Rejecters for waits in progress, so Stop can end them at once. */
const activeWaits = new Set<(error: Error) => void>();

/** Ends every wait in progress with `error` (used by Stop). */
function cancelActiveWaits(error: Error): void {
  for (const cancel of [...activeWaits]) cancel(error);
}

type XYZ = { x: number; y: number; z: number };

function parseXYZ(raw: string | undefined, key: "WCO" | "WPos"): XYZ | null {
  const m = raw?.match(new RegExp(`${key}:([-\\d.]+),([-\\d.]+),([-\\d.]+)`));
  return m ? { x: +m[1], y: +m[2], z: +m[3] } : null;
}

function sendCommandsAndWaitForIdle(...commands: string[]): Promise<MachineStatus> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe = () => {};
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let commandAccepted = false;
    let idleStatus: MachineStatus | null = null;
    let lastStatus = useMachineStore.getState().status;
    const cancel = (error: Error) => {
      cleanup();
      reject(error);
    };
    activeWaits.add(cancel);
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (quietTimer) clearTimeout(quietTimer);
      unsubscribe();
      activeWaits.delete(cancel);
    };
    // Restarted by every report; fires only if the machine stays silent.
    const armQuietTimer = () => {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        const current = useMachineStore.getState().status;
        if (isValidIdleStatus(current)) finish(current);
        // Silent but not Idle: the change to Idle may not have been reported.
        else void refreshStatus();
      }, QUIET_IDLE_MS);
    };
    const finish = (status: MachineStatus) => {
      cleanup();
      resolve(status);
    };
    unsubscribe = useMachineStore.subscribe((state) => {
      const status = state.status;
      if (status === lastStatus) return; // some other part of the store changed
      // A changed report means it's still going: a long move isn't a hang.
      if (status?.raw !== lastStatus?.raw) armTimeout();
      lastStatus = status;
      if (commandAccepted) armQuietTimer();
      if (!isValidIdleStatus(status)) return;
      idleStatus = status;
      if (commandAccepted) finish(status);
    });

    // Times out only after STATUS_TIMEOUT_MS without any report.
    const armTimeout = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        cleanup();
        const state = useMachineStore.getState().status?.state;
        reject(new Error(
          state && state !== "Idle"
            ? `The machine didn't return to Idle (it reports ${state}). Check the machine and try again.`
            : "No idle status update was received. Check the machine status connection and try again.",
        ));
      }, STATUS_TIMEOUT_MS);
    };
    armTimeout();
    const accepted = () => {
      commandAccepted = true;
      if (idleStatus) finish(idleStatus);
      else armQuietTimer();
    };
    void (async () => {
      for (const command of commands) {
        await window.terraForge.fluidnc.sendCommand(command);
      }
      accepted();
    })().catch((error: unknown) => {
      cleanup();
      reject(error);
    });
  });
}

/** Homing on a large machine can take a while, and may report nothing meanwhile. */
const HOMING_TIMEOUT_MS = 120_000;
const HOMED_MESSAGE = /\[MSG:Homed/;
const HOMING_FAILED = /ALARM:\d|\[MSG:ERR/;

/**
 * Runs `$H` and resolves with the machine's status once homing is done.
 *
 * Position reports can't say when that is: FluidNC reports only on change,
 * so homing a machine already at home may send none at all, and 4.1 can
 * deliver an Idle report from before the cycle started after `$H` is
 * accepted. FluidNC prints "[MSG:Homed:…]" when it finishes, which arrives
 * in the command's reply (4.1 holds the reply until the cycle ends) or on
 * the console. A Home report followed by Idle counts too.
 */
function homeAndWaitForIdle(): Promise<MachineStatus> {
  const homed = new Promise<void>((resolve, reject) => {
    let sawHoming = false;
    const cleanup = () => {
      clearTimeout(timer);
      unsubscribeStatus();
      unsubscribeConsole();
      activeWaits.delete(cancel);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const cancel = (error: Error) => {
      cleanup();
      reject(error);
    };
    activeWaits.add(cancel);
    const check = (text: string) => {
      if (HOMING_FAILED.test(text)) {
        cancel(new Error(`The machine reported ${text.trim()}. Check the end stops and try again.`));
      } else if (HOMED_MESSAGE.test(text)) {
        done();
      }
    };
    const timer = setTimeout(
      () => cancel(new Error("Homing didn't finish. Check the machine and try again.")),
      HOMING_TIMEOUT_MS,
    );
    const unsubscribeConsole = window.terraForge.fluidnc.onConsoleMessage(check);
    const unsubscribeStatus = useMachineStore.subscribe((state, previous) => {
      if (state.status === previous.status) return;
      if (state.status?.state === "Home") sawHoming = true;
      else if (sawHoming && isValidIdleStatus(state.status)) done();
    });
    window.terraForge.fluidnc.sendCommand("$H").then(
      (reply) => check(String(reply ?? "")),
      (error: unknown) => {
        // A reply held open for the whole cycle can time out; the console
        // still says when homing ends.
        if (!/timed? ?out/i.test(String(error))) cancel(error as Error);
      },
    );
  });
  // Then the position, asked for: the end of the cycle may not be reported.
  return homed.then(async () => {
    const status = await refreshStatus();
    return isValidIdleStatus(status) ? status : sendCommandsAndWaitForIdle();
  });
}

export function useBedMeshCalibration(controller: MachineConfigDialogController) {
  const { form, change, inputCls } = controller;
  const connected = controller.machineStore.connected;
  const activeConfigId = controller.machineStore.activeConfigId;
  const selectedId = controller.selectedId;
  const zCompensationAvailable = supportsBedMeshZCompensation(form);
  const canCalibrate =
    connected && !!activeConfigId && selectedId === activeConfigId && zCompensationAvailable;

  const [wizardStep, setWizardStep] = useState<BedMeshWizardStep>("closed");
  const [originMethod, setOriginMethodState] = useState<BedMeshOriginMethod | null>(null);
  const [originReady, setOriginReady] = useState(false);
  const [homeCheck, setHomeCheck] = useState<BedMeshHomeCheck | null>(null);
  const [xPoints, setXPoints] = useState(form.bedMesh?.xPoints ?? 3);
  const [yPoints, setYPoints] = useState(form.bedMesh?.yPoints ?? 3);
  const [meshName, setMeshName] = useState(form.bedMesh?.name ?? "Bed mesh");
  const [points, setPoints] = useState<BedMeshPoint[]>([]);
  const [index, setIndex] = useState(0);
  /** The point the pen is travelling to, until the machine reports it's there. */
  const [movingTo, setMovingTo] = useState<number | null>(null);
  /** The pen has reached point `index` (false if a move there was stopped or failed). */
  const [atPoint, setAtPoint] = useState(true);
  const [z, setZ] = useState(0);
  const [busy, setBusy] = useState(false);
  const [datumZ, setDatumZ] = useState<number | null>(null);
  const [result, setResult] = useState<BedMesh | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const stoppedRef = useRef(false);
  const machineStatus = controller.machineStore.status;
  // FluidNC reports WCO only every few reports (and when it changes), so
  // keep the last one seen. Explicit WPos gives it too.
  const wcoRef = useRef<XYZ | null>(null);
  useEffect(() => {
    if (!machineStatus) return;
    const wco = parseXYZ(machineStatus.raw, "WCO");
    const wpos = parseXYZ(machineStatus.raw, "WPos");
    if (wco) wcoRef.current = wco;
    else if (wpos) {
      const { mpos } = machineStatus;
      wcoRef.current = { x: mpos.x - wpos.x, y: mpos.y - wpos.y, z: mpos.z - wpos.z };
    }
  }, [machineStatus]);
  /** A reading can only be taken with the machine stopped (not mid-jog). */
  const machineIdle = isValidIdleStatus(machineStatus);

  useEffect(() => {
    if (datumZ !== null && machineStatus && Number.isFinite(machineStatus.mpos.z)) {
      setZ(machineStatus.mpos.z - datumZ);
    }
  }, [datumZ, machineStatus?.mpos.z]);

  const zUp: 1 | -1 = form.invertZJogControls ? -1 : 1;
  // Machine Z where the pen touched the first point; travel height is
  // measured from it. A ref, as recordPoint sets it and lifts in one go.
  const travelDatumRef = useRef<number | null>(null);
  // Machine Z when probing started: clear of the bed, the user made sure.
  const startZRef = useRef<number | null>(null);
  const lift = () => retractZ(zUp, travelDatumRef.current, startZRef.current);

  const persistMesh = async (patch: Partial<typeof form>) => {
    change(patch);
    if (connected && activeConfigId && selectedId === activeConfigId) {
      try {
        await controller.machineStore.updateConfig(activeConfigId, patch);
      } catch (err) {
        setError(`Bed mesh could not be saved to this machine: ${String(err)}`);
      }
    }
  };

  /** Runs one machine operation at a time, surfacing failures as `error`. */
  const runExclusive = async (failure: string, operation: () => Promise<void>) => {
    if (!canCalibrate || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    stoppedRef.current = false;
    try {
      setError(null);
      await operation();
    } catch (err) {
      setError(
        stoppedRef.current
          ? "Stopped. Check the machine before continuing."
          : `${failure}: ${String(err)}`,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /**
   * Lifts the pen and moves to a probe point. `slow` uses the jog speed
   * instead of a rapid — for the first move, the one that goes wrong if
   * X0 Y0 isn't where the user thinks.
   */
  const move = async (point: BedMeshPoint, slow = false) => {
    await lift();
    const xy = `X${point.x.toFixed(3)} Y${point.y.toFixed(3)}`;
    return sendCommandsAndWaitForIdle(
      slow ? `G90 G21 G1 ${xy} F${form.jogSpeed ?? 3000}` : `G90 G21 G0 ${xy}`,
    );
  };

  // Losing the connection (or switching profile) closes the wizard. If the
  // pen was near the bed, lift it clear on the way out.
  useEffect(() => {
    if (canCalibrate || wizardStep === "closed") return;
    const wasProbing = wizardStep === "probe";
    setWizardStep("closed");
    if (wasProbing && connected) {
      void lift().catch((err: unknown) =>
        setError(`Could not retract the Z axis: ${String(err)}`),
      );
    }
  }, [canCalibrate, connected, wizardStep]);

  const openWizard = () => {
    if (!canCalibrate) return;
    setError(null);
    setOriginMethodState(null);
    setOriginReady(false);
    setHomeCheck(null);
    setResult(null);
    setWizardStep("grid");
  };

  const gridPoints = (): BedMeshPoint[] => {
    const xMin = form.origin === "center" ? -form.bedWidth / 2 : 0;
    const yMin = form.origin === "center" ? -form.bedHeight / 2 : 0;
    return createBedMeshPoints(xPoints, yPoints, form.bedWidth, form.bedHeight, xMin, yMin);
  };

  const confirmGrid = () => {
    if (!hasValidGrid(xPoints, yPoints, form.bedWidth, form.bedHeight)) {
      setError("Choose valid grid dimensions and bed size before calibrating.");
      return;
    }
    if (!meshName.trim()) {
      setError("Enter a name for the bed mesh.");
      return;
    }
    setError(null);
    setWizardStep("origin");
  };

  const setOriginMethod = (method: BedMeshOriginMethod) => {
    setOriginMethodState(method);
    setOriginReady(false);
    setHomeCheck(null);
    setError(null);
  };

  /**
   * Homes, then works out where work X0 Y0 sits relative to the homed
   * position. Only "X0 Y0 is at home" makes the origin ready by itself;
   * otherwise the user sets X0 Y0 at home or keeps it knowingly.
   */
  const home = () =>
    runExclusive("Homing failed", async () => {
      await requireReadyToHome();
      setHomeCheck(null);
      setOriginReady(false);
      const homed = await homeAndWaitForIdle();
      const wco = wcoRef.current;
      if (!wco) {
        setHomeCheck({ kind: "unknown" });
        return;
      }
      // X0 Y0 is at machine position WCO; home is at the current MPos.
      const dx = wco.x - homed.mpos.x;
      const dy = wco.y - homed.mpos.y;
      if (Math.abs(dx) <= AT_HOME_TOLERANCE_MM && Math.abs(dy) <= AT_HOME_TOLERANCE_MM) {
        setHomeCheck({ kind: "at-home" });
        setOriginReady(true);
      } else {
        setHomeCheck({ kind: "offset", dx, dy });
      }
    });

  /** After homing: make the homed position X0 Y0. */
  const setZeroAtHome = () =>
    runExclusive("X0 Y0 could not be set", async () => {
      await requireCurrentIdleStatus();
      await window.terraForge.fluidnc.sendCommand("G10 L20 P1 X0 Y0");
      setHomeCheck({ kind: "at-home" });
      setOriginReady(true);
    });

  /**
   * Stops whatever the wizard has the machine doing: feed hold, so it
   * decelerates, then a soft reset to clear the remaining motion. Waits in
   * progress end straight away.
   */
  const stop = async () => {
    stoppedRef.current = true;
    cancelActiveWaits(new Error("Stopped"));
    try {
      await window.terraForge.fluidnc.pauseJob();
      await window.terraForge.fluidnc.abortJob();
    } catch (err) {
      setError(`Stop could not be sent: ${String(err)}. Use the machine's own stop.`);
    }
  };

  /**
   * X0 Y0 is in place — set from the embedded jog panel, or already set
   * before calibration started.
   */
  const confirmOrigin = () => {
    setError(null);
    setOriginReady(true);
  };

  const startProbing = () =>
    runExclusive("Calibration could not start", async () => {
      const status = await requireCurrentIdleStatus();
      const grid = gridPoints();
      // A new run. The pen travels to the first point at its current height,
      // which the origin step asked the user to make clear of the bed.
      travelDatumRef.current = null;
      startZRef.current = status.mpos.z;
      await move(grid[0], true);
      setAtPoint(true);
      setPoints(grid);
      setResult(null);
      setIndex(0);
      setZ(0);
      setDatumZ(null);
      setWizardStep("probe");
    });

  /**
   * Records the pen height at the current point and moves to the next one.
   * After the last point the pen is lifted and the mesh is ready to review
   * (`result` is set); the wizard stays on the probe step until the user
   * moves on with `showReview`.
   */
  const recordPoint = () =>
    runExclusive("Calibration could not continue", async () => {
      const status = await requireCurrentIdleStatus();
      const nextDatumZ = datumZ ?? status.mpos.z;
      travelDatumRef.current = nextDatumZ;
      const offset = status.mpos.z - nextDatumZ;
      const updated = points.map((point, pointIndex) =>
        pointIndex === serpentineIndex(index, xPoints) ? { ...point, z: offset } : point,
      );
      if (index + 1 < updated.length) {
        // The reading is kept even if the move on is stopped; the next
        // point can then be reached with moveToPoint before recording it.
        setPoints(updated);
        setIndex(index + 1);
        setDatumZ(nextDatumZ);
        setAtPoint(false);
        setMovingTo(index + 1);
        const nextStatus = await move(updated[serpentineIndex(index + 1, xPoints)])
          .finally(() => setMovingTo(null));
        setAtPoint(true);
        setZ(nextStatus.mpos.z - nextDatumZ);
        return;
      }
      await lift();
      setPoints(updated);
      setResult({
        version: 1,
        name: meshName.trim(),
        xPoints,
        yPoints,
        xMinMM: form.origin === "center" ? -form.bedWidth / 2 : 0,
        yMinMM: form.origin === "center" ? -form.bedHeight / 2 : 0,
        widthMM: form.bedWidth,
        heightMM: form.bedHeight,
        points: updated,
        createdAt: new Date().toISOString(),
      });
      setIndex(updated.length);
    });

  /** Moves to the current point again — after a move there was stopped or failed. */
  const moveToPoint = () =>
    runExclusive("Could not move to the point", async () => {
      await requireCurrentIdleStatus();
      const point = points[serpentineIndex(index, xPoints)];
      if (!point) return;
      setMovingTo(index);
      await move(point).finally(() => setMovingTo(null));
      setAtPoint(true);
    });

  const showReview = () => {
    if (wizardStep === "probe" && result) setWizardStep("review");
  };

  const back = () => {
    setError(null);
    if (wizardStep === "origin") setWizardStep("grid");
  };

  /**
   * Jumps back to an earlier step (the stepper's circles). Leaving probing
   * lifts the pen first; probed points and an unsaved result are discarded.
   * Returning to "probe" from the review re-probes from the first point.
   */
  const goToStep = async (target: BedMeshWizardStep) => {
    const order: BedMeshWizardStep[] = ["grid", "origin", "probe", "review"];
    if (busyRef.current || order.indexOf(target) < 0 || order.indexOf(target) >= order.indexOf(wizardStep)) return;
    setError(null);
    if (target === "probe") {
      await startProbing();
      return;
    }
    if (wizardStep === "probe") {
      await runExclusive("Could not retract the Z axis", async () => {
        await lift();
        setPoints([]);
        setWizardStep(target);
      });
      return;
    }
    setResult(null);
    setWizardStep(target);
  };

  /** Stores the reviewed mesh on the machine profile and closes the wizard. */
  const saveResult = async (enable: boolean) => {
    if (!result) return;
    await persistMesh({ bedMesh: result, bedMeshEnabled: enable });
    setWizardStep("closed");
  };

  const cancel = async () => {
    if (busyRef.current) return;
    if (wizardStep !== "probe") {
      setError(null);
      setWizardStep("closed");
      return;
    }
    // Probing leaves the pen at (or near) the bed — lift it before closing.
    await runExclusive("Could not retract the Z axis", async () => {
      await lift();
      setWizardStep("closed");
    });
  };


  return {
    form,
    inputCls,
    connected,
    canCalibrate,
    zCompensationAvailable,
    wizardStep,
    originMethod,
    originReady,
    xPoints,
    yPoints,
    setXPoints,
    setYPoints,
    meshName,
    setMeshName,
    points,
    index,
    movingTo,
    atPoint,
    homeCheck,
    setZeroAtHome,
    stop,
    moveToPoint,
    machineIdle,
    z,
    datumZ,
    busy,
    result,
    error,
    openWizard,
    confirmGrid,
    setOriginMethod,
    home,
    confirmOrigin,
    startProbing,
    recordPoint,
    showReview,
    back,
    goToStep,
    saveResult,
    cancel,
    persistMesh,
  };
}

export function clampGridPoints(value: number): number {
  if (!Number.isFinite(value)) return 2;
  return Math.min(MAX_BED_MESH_GRID_POINTS, Math.max(2, Math.round(value)));
}

function hasValidGrid(xPoints: number, yPoints: number, width: number, height: number): boolean {
  return Number.isInteger(xPoints) && xPoints >= 2 && xPoints <= MAX_BED_MESH_GRID_POINTS &&
    Number.isInteger(yPoints) && yPoints >= 2 && yPoints <= MAX_BED_MESH_GRID_POINTS &&
    Number.isFinite(width) && width > 0 &&
    Number.isFinite(height) && height > 0;
}
