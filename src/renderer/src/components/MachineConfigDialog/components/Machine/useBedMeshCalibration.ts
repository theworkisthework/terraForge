import { useEffect, useRef, useState } from "react";
import {
  createBedMeshPoints,
  isValidBedMesh,
  MAX_BED_MESH_GRID_POINTS,
} from "../../../../../../types/bedMesh";
import type { BedMesh, BedMeshPoint, JogStep, MachineConfig, MachineStatus } from "../../../../../../types";
import { useMachineStore } from "../../../../store/machineStore";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";

const STATUS_TIMEOUT_MS = 10_000;

async function retractZ(): Promise<void> {
  await window.terraForge.fluidnc.sendCommand("G91 G21 G0 Z5");
  await window.terraForge.fluidnc.sendCommand("G90 G21");
}

function waitForStableIdleStatus(): Promise<MachineStatus> {
  return new Promise((resolve, reject) => {
    let lastPosition: MachineStatus["wpos"] | null = null;
    let stableUpdates = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe = () => {};
    const finish = (status: MachineStatus) => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      resolve(status);
    };
    unsubscribe = useMachineStore.subscribe((state) => {
      const status = state.status;
      if (
        !status ||
        status.state !== "Idle" ||
        !Number.isFinite(status.wpos.x) ||
        !Number.isFinite(status.wpos.y) ||
        !Number.isFinite(status.wpos.z)
      ) {
        lastPosition = null;
        stableUpdates = 0;
        return;
      }

      const position = status.wpos;
      if (
        lastPosition &&
        Math.abs(lastPosition.x - position.x) < 0.001 &&
        Math.abs(lastPosition.y - position.y) < 0.001 &&
        Math.abs(lastPosition.z - position.z) < 0.001
      ) {
        stableUpdates++;
      } else {
        stableUpdates = 1;
      }
      lastPosition = position;
      if (stableUpdates >= 2) finish(status);
    });

    timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("No stable idle status was received. Check the machine status connection and try again."));
    }, STATUS_TIMEOUT_MS);
  });
}

export function useBedMeshCalibration(controller: MachineConfigDialogController) {
  const { form, change, inputCls } = controller;
  const connected = controller.machineStore.connected;
  const activeConfigId = controller.machineStore.activeConfigId;
  const selectedId = controller.selectedId;
  const canCalibrate = connected && !!activeConfigId && selectedId === activeConfigId;
  const [open, setOpen] = useState(false);
  const [showStartOptions, setShowStartOptions] = useState(false);
  const [startChoice, setStartChoice] = useState<"home" | "known" | null>(null);
  const [xPoints, setXPoints] = useState(form.bedMesh?.xPoints ?? 3);
  const [yPoints, setYPoints] = useState(form.bedMesh?.yPoints ?? 3);
  const [points, setPoints] = useState<BedMeshPoint[]>([]);
  const [index, setIndex] = useState(0);
  const [z, setZ] = useState(0);
  const [step, setStep] = useState<JogStep>(1);
  const [feedrate, setFeedrate] = useState(form.jogSpeed ?? 3000);
  const [jogging, setJogging] = useState(false);
  const [datumZ, setDatumZ] = useState<number | null>(null);
  const [profileName, setProfileName] = useState(form.bedMesh?.name ?? "Bed mesh");
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const positioningClearanceRaised = useRef(false);
  const machineStatus = controller.machineStore.status;

  useEffect(() => {
    if (datumZ !== null && machineStatus && Number.isFinite(machineStatus.wpos.z)) {
      setZ(machineStatus.wpos.z - datumZ);
    }
  }, [datumZ, machineStatus?.wpos.z]);

  useEffect(() => {
    setProfileName(form.bedMesh?.name ?? "Bed mesh");
  }, [form.bedMesh?.name]);

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

  const move = async (point: BedMeshPoint) => {
    await retractZ();
    await waitForStableIdleStatus();
    await window.terraForge.fluidnc.sendCommand(
      `G90 G21 G0 X${point.x.toFixed(3)} Y${point.y.toFixed(3)}`,
    );
    return waitForStableIdleStatus();
  };

  useEffect(() => {
    if (canCalibrate) return;
    setShowStartOptions(false);
    setStartChoice(null);
    if (open) {
      setOpen(false);
      if (connected) {
        void retractZ().catch((err: unknown) =>
          setError(`Could not retract the Z axis: ${String(err)}`),
        );
      }
    }
  }, [canCalibrate, connected, open]);

  const begin = () => {
    if (!canCalibrate) return;
    if (!hasValidGrid(xPoints, yPoints, form.bedWidth, form.bedHeight)) {
      setError("Choose valid grid dimensions and bed size before calibrating.");
      return;
    }
    positioningClearanceRaised.current = false;
    setError(null);
    setShowStartOptions(true);
  };

  const startCalibration = async (choice: "home" | "known") => {
    if (!canCalibrate || busyRef.current) return;
    busyRef.current = true;
    setJogging(true);
    try {
      const xMin = form.origin === "center" ? -form.bedWidth / 2 : 0;
      const yMin = form.origin === "center" ? -form.bedHeight / 2 : 0;
      const gridPoints = createBedMeshPoints(
        xPoints,
        yPoints,
        form.bedWidth,
        form.bedHeight,
        xMin,
        yMin,
      );
      if (choice === "home") {
        await window.terraForge.fluidnc.sendCommand("$H");
        await waitForStableIdleStatus();
      } else {
        await waitForStableIdleStatus();
      }
      await move(gridPoints[0]);
      setPoints(gridPoints);
      setIndex(0);
      setZ(0);
      setDatumZ(null);
      setOpen(true);
      setStartChoice(null);
      setShowStartOptions(false);
      setError(null);
    } catch (err) {
      setError(`Calibration could not start: ${String(err)}`);
    } finally {
      busyRef.current = false;
      setJogging(false);
    }
  };

  const next = async () => {
    if (!canCalibrate || busyRef.current) return;
    busyRef.current = true;
    setJogging(true);
    try {
      const status = await waitForStableIdleStatus();
      const nextDatumZ = datumZ ?? status.wpos.z;
      const offset = status.wpos.z - nextDatumZ;
      const updated = points.map((point, pointIndex) =>
        pointIndex === index ? { ...point, z: offset } : point,
      );
      if (index + 1 < updated.length) {
        const nextStatus = await move(updated[index + 1]);
        setPoints(updated);
        setIndex(index + 1);
        setDatumZ(nextDatumZ);
        setZ(nextStatus.wpos.z - nextDatumZ);
        return;
      }
      await retractZ();
      await waitForStableIdleStatus();
      const xMinMM = form.origin === "center" ? -form.bedWidth / 2 : 0;
      const yMinMM = form.origin === "center" ? -form.bedHeight / 2 : 0;
      const profile: BedMesh = {
        version: 1,
        name: form.bedMesh?.name ?? "Bed mesh",
        xPoints,
        yPoints,
        xMinMM,
        yMinMM,
        widthMM: form.bedWidth,
        heightMM: form.bedHeight,
        points: updated,
        createdAt: new Date().toISOString(),
      };
      await persistMesh({ bedMesh: profile, bedMeshEnabled: false });
      setOpen(false);
    } catch (err) {
      setError(`Calibration could not continue: ${String(err)}`);
    } finally {
      busyRef.current = false;
      setJogging(false);
    }
  };

  const cancelCalibration = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setJogging(true);
    try {
      await retractZ();
      await waitForStableIdleStatus();
      setOpen(false);
    } catch (err) {
      setError(`Could not retract the Z axis: ${String(err)}`);
    } finally {
      busyRef.current = false;
      setJogging(false);
    }
  };

  const jogZ = async (delta: number) => {
    if (!canCalibrate || busyRef.current) return;
    busyRef.current = true;
    setJogging(true);
    try {
      setError(null);
      await waitForStableIdleStatus();
      await window.terraForge.fluidnc.sendCommand(
        `$J=G91 G21 Z${delta.toFixed(3)} F${feedrate}`,
      );
      const status = await waitForStableIdleStatus();
      if (datumZ !== null) setZ(status.wpos.z - datumZ);
    } catch (err) {
      setError(`Z adjustment failed: ${String(err)}`);
    } finally {
      busyRef.current = false;
      setJogging(false);
    }
  };

  const jogXY = async (axis: "X" | "Y", delta: number) => {
    if (!canCalibrate || busyRef.current) return;
    busyRef.current = true;
    setJogging(true);
    try {
      setError(null);
      await waitForStableIdleStatus();
      if (!positioningClearanceRaised.current) {
        await retractZ();
        await waitForStableIdleStatus();
        positioningClearanceRaised.current = true;
      }
      await window.terraForge.fluidnc.sendCommand(
        `$J=G91 G21 ${axis}${delta.toFixed(3)} F${feedrate}`,
      );
      await waitForStableIdleStatus();
    } catch (err) {
      setError(`Position adjustment failed: ${String(err)}`);
    } finally {
      busyRef.current = false;
      setJogging(false);
    }
  };

  const setXYZero = async () => {
    if (!canCalibrate || busyRef.current) return;
    busyRef.current = true;
    setJogging(true);
    try {
      setError(null);
      await waitForStableIdleStatus();
      await window.terraForge.fluidnc.sendCommand("G10 L20 P1 X0 Y0");
      await waitForStableIdleStatus();
    } catch (err) {
      setError(`XY zero could not be set: ${String(err)}`);
    } finally {
      busyRef.current = false;
      setJogging(false);
    }
  };

  const save = () => saveMeshProfile(form.bedMesh, profileName, persistMesh, setError);
  const load = () => loadMeshProfile(persistMesh, setError, setXPoints, setYPoints);

  return {
    form,
    inputCls,
    connected,
    canCalibrate,
    open,
    showStartOptions,
    setShowStartOptions,
    startChoice,
    setStartChoice,
    xPoints,
    yPoints,
    points,
    index,
    z,
    step,
    setStep,
    feedrate,
    setFeedrate,
    jogging,
    datumZ,
    profileName,
    setProfileName,
    error,
    setXPoints,
    setYPoints,
    begin,
    startCalibration,
    next,
    cancelCalibration,
    jogZ,
    jogXY,
    setXYZero,
    save,
    load,
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

type PersistMesh = (patch: Partial<Omit<MachineConfig, "id">>) => Promise<void>;

async function saveMeshProfile(
  mesh: BedMesh | undefined,
  profileName: string,
  persistMesh: PersistMesh,
  setError: (error: string | null) => void,
): Promise<void> {
  if (!mesh) return;
  const name = profileName.trim();
  if (!name) {
    setError("Enter a name for the bed mesh profile.");
    return;
  }
  try {
    setError(null);
    const filename = name.replace(/[\\/:*?"<>|]/g, "_").replace(/\.json$/i, "");
    const path = await window.terraForge.fs.saveBedMeshDialog(`${filename}.json`);
    if (!path) return;
    const renamedMesh = { ...mesh, name };
    await window.terraForge.fs.writeFile(path, JSON.stringify(renamedMesh, null, 2));
    await persistMesh({ bedMesh: renamedMesh });
  } catch (err) {
    setError(`Mesh could not be saved: ${String(err)}`);
  }
}

async function loadMeshProfile(
  persistMesh: PersistMesh,
  setError: (error: string | null) => void,
  setXPoints: (points: number) => void,
  setYPoints: (points: number) => void,
): Promise<void> {
  try {
    const path = await window.terraForge.fs.openBedMeshDialog();
    if (!path) return;
    setError(null);
    const parsed = JSON.parse(await window.terraForge.fs.readFile(path)) as BedMesh;
    if (!isValidBedMesh(parsed)) throw new Error("Invalid dimensions, size, or point data.");
    await persistMesh({ bedMesh: parsed, bedMeshEnabled: false });
    setXPoints(parsed.xPoints);
    setYPoints(parsed.yPoints);
  } catch (err) {
    setError(`Mesh import failed: ${String(err)}`);
  }
}
