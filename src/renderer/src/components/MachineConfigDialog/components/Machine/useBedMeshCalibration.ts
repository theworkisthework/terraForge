import { useEffect, useState } from "react";
import {
  createBedMeshPoints,
  isValidBedMesh,
  MAX_BED_MESH_GRID_POINTS,
} from "../../../../../../types/bedMesh";
import type { BedMesh, BedMeshPoint, MachineConfig } from "../../../../../../types";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";

async function retractZ(): Promise<void> {
  await window.terraForge.fluidnc.sendCommand("G91 G21 G0 Z5");
  await window.terraForge.fluidnc.sendCommand("G90 G21");
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
  const [datumZ, setDatumZ] = useState<number | null>(null);
  const [profileName, setProfileName] = useState(form.bedMesh?.name ?? "Bed mesh");
  const [error, setError] = useState<string | null>(null);

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
    await window.terraForge.fluidnc.sendCommand(
      `G90 G21 G0 X${point.x.toFixed(3)} Y${point.y.toFixed(3)}`,
    );
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
    setError(null);
    setShowStartOptions(true);
  };

  const startCalibration = async (choice: "home" | "known") => {
    if (!canCalibrate) return;
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
      if (choice === "home") await window.terraForge.fluidnc.sendCommand("$H");
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
    }
  };

  const next = async () => {
    if (!canCalibrate) return;
    try {
      const status = await window.terraForge.fluidnc.getStatus();
      if (status.state !== "Idle") throw new Error("Wait for the Z axis to stop moving before capturing this point.");
      if (!Number.isFinite(status.wpos.z)) throw new Error("The controller did not report a valid work Z position.");
      const nextDatumZ = datumZ ?? status.wpos.z;
      const offset = status.wpos.z - nextDatumZ;
      const updated = points.map((point, pointIndex) =>
        pointIndex === index ? { ...point, z: offset } : point,
      );
      if (index + 1 < updated.length) {
        await move(updated[index + 1]);
        setPoints(updated);
        setIndex(index + 1);
        setDatumZ(nextDatumZ);
        setZ(updated[index + 1].z);
        return;
      }
      await retractZ();
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
    }
  };

  const cancelCalibration = async () => {
    try {
      await retractZ();
      setOpen(false);
    } catch (err) {
      setError(`Could not retract the Z axis: ${String(err)}`);
    }
  };

  const jogZ = (delta: number) =>
    jogCalibrationZ(canCalibrate, delta, datumZ, setZ, setError);

  const jogXY = (axis: "X" | "Y", delta: -1 | 1) =>
    jogCalibrationXY(canCalibrate, axis, delta, setError);
  const setXYZero = () => setCalibrationXYZero(canCalibrate, setError);

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

async function jogCalibrationZ(
  canCalibrate: boolean,
  delta: number,
  datumZ: number | null,
  setZ: (z: number) => void,
  setError: (error: string | null) => void,
): Promise<void> {
  if (!canCalibrate) return;
  try {
    await window.terraForge.fluidnc.sendCommand(`$J=G91 G21 Z${delta} F300`);
    const status = await window.terraForge.fluidnc.getStatus();
    if (datumZ !== null && Number.isFinite(status.wpos.z)) setZ(status.wpos.z - datumZ);
  } catch (err) {
    setError(`Z adjustment failed: ${String(err)}`);
  }
}

async function jogCalibrationXY(
  canCalibrate: boolean,
  axis: "X" | "Y",
  delta: -1 | 1,
  setError: (error: string | null) => void,
): Promise<void> {
  if (!canCalibrate) return;
  try {
    const status = await window.terraForge.fluidnc.getStatus();
    if (status.state !== "Idle") throw new Error("Wait for the machine to stop before jogging.");
    await retractZ();
    await window.terraForge.fluidnc.sendCommand(`$J=G91 G21 ${axis}${delta} F300`);
  } catch (err) {
    setError(`Position adjustment failed: ${String(err)}`);
  }
}

async function setCalibrationXYZero(
  canCalibrate: boolean,
  setError: (error: string | null) => void,
): Promise<void> {
  if (!canCalibrate) return;
  try {
    const status = await window.terraForge.fluidnc.getStatus();
    if (status.state !== "Idle") throw new Error("Wait for the machine to stop before setting XY zero.");
    await window.terraForge.fluidnc.sendCommand("G10 L20 P1 X0 Y0");
  } catch (err) {
    setError(`XY zero could not be set: ${String(err)}`);
  }
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
