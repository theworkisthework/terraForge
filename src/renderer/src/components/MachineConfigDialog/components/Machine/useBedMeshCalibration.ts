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

function requireCurrentIdleStatus(): MachineStatus {
  const status = useMachineStore.getState().status;
  if (!isValidIdleStatus(status)) {
    throw new Error("Wait for a valid idle machine status before continuing.");
  }
  return status;
}

/** Lifts the pen 5 mm. `up` is -1 on machines whose Z jog is inverted. */
async function retractZ(up: 1 | -1): Promise<void> {
  await sendCommandsAndWaitForIdle(`G91 G21 G0 Z${5 * up}`, "G90 G21");
}

function sendCommandsAndWaitForIdle(...commands: string[]): Promise<MachineStatus> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe = () => {};
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let commandAccepted = false;
    let idleStatus: MachineStatus | null = null;
    let lastStatus = useMachineStore.getState().status;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (quietTimer) clearTimeout(quietTimer);
      unsubscribe();
    };
    // Restarted by every report; fires only if the machine stays silent.
    const armQuietTimer = () => {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        const current = useMachineStore.getState().status;
        if (isValidIdleStatus(current)) finish(current);
      }, QUIET_IDLE_MS);
    };
    const finish = (status: MachineStatus) => {
      cleanup();
      resolve(status);
    };
    unsubscribe = useMachineStore.subscribe((state) => {
      const status = state.status;
      if (status === lastStatus) return; // some other part of the store changed
      lastStatus = status;
      if (commandAccepted) armQuietTimer();
      if (!isValidIdleStatus(status)) return;
      idleStatus = status;
      if (commandAccepted) finish(status);
    });

    timer = setTimeout(() => {
      cleanup();
      const state = useMachineStore.getState().status?.state;
      reject(new Error(
        state && state !== "Idle"
          ? `The machine didn't return to Idle (it reports ${state}). Check the machine and try again.`
          : "No idle status update was received. Check the machine status connection and try again.",
      ));
    }, STATUS_TIMEOUT_MS);
    void (async () => {
      for (const command of commands) {
        await window.terraForge.fluidnc.sendCommand(command);
      }
      commandAccepted = true;
      if (idleStatus) finish(idleStatus);
      else armQuietTimer();
    })().catch((error: unknown) => {
      cleanup();
      reject(error);
    });
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
  const [xPoints, setXPoints] = useState(form.bedMesh?.xPoints ?? 3);
  const [yPoints, setYPoints] = useState(form.bedMesh?.yPoints ?? 3);
  const [meshName, setMeshName] = useState(form.bedMesh?.name ?? "Bed mesh");
  const [points, setPoints] = useState<BedMeshPoint[]>([]);
  const [index, setIndex] = useState(0);
  /** The point the pen is travelling to, until the machine reports it's there. */
  const [movingTo, setMovingTo] = useState<number | null>(null);
  const [z, setZ] = useState(0);
  const [busy, setBusy] = useState(false);
  const [datumZ, setDatumZ] = useState<number | null>(null);
  const [result, setResult] = useState<BedMesh | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const machineStatus = controller.machineStore.status;
  /** A reading can only be taken with the machine stopped (not mid-jog). */
  const machineIdle = isValidIdleStatus(machineStatus);

  useEffect(() => {
    if (datumZ !== null && machineStatus && Number.isFinite(machineStatus.mpos.z)) {
      setZ(machineStatus.mpos.z - datumZ);
    }
  }, [datumZ, machineStatus?.mpos.z]);

  const lift = () => retractZ(form.invertZJogControls ? -1 : 1);

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
    try {
      setError(null);
      await operation();
    } catch (err) {
      setError(`${failure}: ${String(err)}`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const move = async (point: BedMeshPoint) => {
    await lift();
    return sendCommandsAndWaitForIdle(
      `G90 G21 G0 X${point.x.toFixed(3)} Y${point.y.toFixed(3)}`,
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
    setError(null);
  };

  const home = () =>
    runExclusive("Homing failed", async () => {
      requireCurrentIdleStatus();
      await sendCommandsAndWaitForIdle("$H");
      setOriginReady(true);
    });

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
      requireCurrentIdleStatus();
      const grid = gridPoints();
      await move(grid[0]);
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
      const status = requireCurrentIdleStatus();
      const nextDatumZ = datumZ ?? status.mpos.z;
      const offset = status.mpos.z - nextDatumZ;
      const updated = points.map((point, pointIndex) =>
        pointIndex === index ? { ...point, z: offset } : point,
      );
      if (index + 1 < updated.length) {
        setMovingTo(index + 1);
        const nextStatus = await move(updated[index + 1]).finally(() => setMovingTo(null));
        setPoints(updated);
        setIndex(index + 1);
        setDatumZ(nextDatumZ);
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
