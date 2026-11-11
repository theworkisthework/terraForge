import { useState } from "react";
import { createBedMeshPoints, isValidBedMesh } from "../../../../../../types/bedMesh";
import type { BedMesh, BedMeshPoint } from "../../../../../../types";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";
import { Button } from "../../../ui";
import { Section } from "../Section";

interface Props {
  controller: MachineConfigDialogController;
}

export function BedMeshSection({ controller }: Props) {
  const { form, change, inputCls } = controller;
  const connected = controller.machineStore.connected;
  const [open, setOpen] = useState(false);
  const [showStartOptions, setShowStartOptions] = useState(false);
  const [startChoice, setStartChoice] = useState<"home" | "known" | null>(null);
  const [xPoints, setXPoints] = useState(form.bedMesh?.xPoints ?? 3);
  const [yPoints, setYPoints] = useState(form.bedMesh?.yPoints ?? 3);
  const [points, setPoints] = useState<BedMeshPoint[]>([]);
  const [index, setIndex] = useState(0);
  const [z, setZ] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const move = async (point: BedMeshPoint) => {
    await window.terraForge.fluidnc.sendCommand(
      `G90 G21 G0 X${point.x.toFixed(3)} Y${point.y.toFixed(3)}`,
    );
  };

  const begin = () => {
    if (!connected) return;
    setShowStartOptions(true);
  };

  const startCalibration = async (choice: "home" | "known") => {
    const gridPoints = createBedMeshPoints(xPoints, yPoints, form.bedWidth, form.bedHeight);
    setStartChoice(null);
    setShowStartOptions(false);
    try {
      if (choice === "home") await window.terraForge.fluidnc.sendCommand("$H");
      // Raise in relative millimetres before any XY move, then restore absolute mode.
      await window.terraForge.fluidnc.sendCommand("G91 G21 G0 Z5");
      await window.terraForge.fluidnc.sendCommand("G90 G21");
      setPoints(gridPoints);
      setIndex(0);
      setZ(0);
      setOpen(true);
      await move(gridPoints[0]);
    } catch (err) {
      setError(`Calibration could not start: ${String(err)}`);
    }
  };

  const next = async () => {
    const updated = points.map((point, pointIndex) =>
      pointIndex === index ? { ...point, z } : point,
    );
    if (index + 1 < updated.length) {
      setPoints(updated);
      setIndex(index + 1);
      setZ(updated[index + 1].z);
      await move(updated[index + 1]);
      return;
    }
    const profile: BedMesh = {
      version: 1,
      name: form.bedMesh?.name ?? "Bed mesh",
      xPoints,
      yPoints,
      widthMM: form.bedWidth,
      heightMM: form.bedHeight,
      points: updated,
      createdAt: new Date().toISOString(),
    };
    change({ bedMesh: profile, bedMeshEnabled: false });
    setOpen(false);
  };

  const save = async () => {
    const mesh = form.bedMesh;
    if (!mesh) return;
    const name = window.prompt("Bed mesh profile name", mesh.name)?.trim();
    if (!name) return;
    try {
      const path = await window.terraForge.fs.saveBedMeshDialog(`${name}.json`);
      if (path) await window.terraForge.fs.writeFile(path, JSON.stringify({ ...mesh, name }, null, 2));
      change({ bedMesh: { ...mesh, name } });
    } catch (err) {
      setError(`Mesh could not be saved: ${String(err)}`);
    }
  };

  const load = async () => {
    const path = await window.terraForge.fs.openBedMeshDialog();
    if (!path) return;
    try {
      const parsed = JSON.parse(await window.terraForge.fs.readFile(path)) as BedMesh;
      if (!isValidBedMesh(parsed)) throw new Error("Invalid dimensions, size, or point data.");
      change({ bedMesh: parsed, bedMeshEnabled: false });
      setXPoints(parsed.xPoints);
      setYPoints(parsed.yPoints);
      setError(null);
    } catch (err) {
      setError(`Mesh import failed: ${String(err)}`);
    }
  };

  return (
    <Section title="Bed Mesh Compensation">
      <label className="flex items-start gap-3 mb-3">
        <input
          type="checkbox"
          checked={form.bedMeshEnabled ?? false}
          disabled={!form.bedMesh}
          title={!form.bedMesh ? "Import or calibrate a mesh before enabling compensation." : undefined}
          onChange={(e) => change({ bedMeshEnabled: e.currentTarget.checked })}
          className="mt-0.5 accent-accent disabled:opacity-50"
        />
        <span className="text-sm text-content">Enable bed mesh compensation</span>
      </label>
      <p className="text-xs text-content-faint mb-3">
        {form.bedMesh
          ? "Bilinear Z offsets will be added to generated G-code for this machine."
          : "Import or calibrate a mesh profile before enabling compensation."}
      </p>
      <div className="flex gap-2 mb-3">
        <label className="text-xs text-content-muted">X points
          <input aria-label="X grid points" type="number" min={2} max={32} value={xPoints}
            onChange={(e) => setXPoints(Math.max(2, Number(e.target.value) || 2))} className={inputCls} />
        </label>
        <label className="text-xs text-content-muted">Y points
          <input aria-label="Y grid points" type="number" min={2} max={32} value={yPoints}
            onChange={(e) => setYPoints(Math.max(2, Number(e.target.value) || 2))} className={inputCls} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={begin} disabled={!connected}>Calibrate grid</Button>
        <Button size="sm" variant="secondary" onClick={load}>Import JSON</Button>
        <Button size="sm" variant="secondary" onClick={save} disabled={!form.bedMesh}>Save JSON</Button>
      </div>
      {form.bedMesh && <p className="text-xs text-content-muted mt-2">Loaded: {form.bedMesh.name} ({form.bedMesh.xPoints} × {form.bedMesh.yPoints})</p>}
      {showStartOptions && connected && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setStartChoice("home")}>Home then calibrate</Button>
          <Button size="sm" variant="secondary" onClick={() => setStartChoice("known")}>Use current position</Button>
        </div>
      )}
      {startChoice !== null && (
        <div role="dialog" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-app border border-border-ui rounded-xl shadow-2xl p-6 w-[380px]">
            <h2 className="text-lg font-semibold text-content mb-2">Start bed mesh calibration?</h2>
            <p className="text-sm text-content-muted mb-4">
              The machine will raise Z by 5 mm before moving. Homing will move to the machine home position; using the current position keeps your existing work coordinates and starts from there.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStartChoice(null)}>Cancel</Button>
              <Button onClick={() => void startCalibration(startChoice)}>Continue</Button>
            </div>
          </div>
        </div>
      )}
      {open && points[index] && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-app border border-border-ui rounded-xl shadow-2xl p-6 w-[360px]">
            <h2 className="text-lg font-semibold text-content mb-2">Calibrate point {index + 1} of {points.length}</h2>
            <p className="text-sm text-content-muted mb-4">Adjust Z until the pen just touches the bed at X {points[index].x.toFixed(2)}, Y {points[index].y.toFixed(2)}.</p>
            <div className="flex gap-2 mb-3">
              <Button size="sm" onClick={() => window.terraForge.fluidnc.sendCommand("$J=G91 G21 Z0.1 F300")}>Raise Z</Button>
              <Button size="sm" onClick={() => window.terraForge.fluidnc.sendCommand("$J=G91 G21 Z-0.1 F300")}>Lower Z</Button>
            </div>
            <label className="text-sm text-content">Final Z offset (mm)
              <input type="number" step="0.001" value={z} onChange={(e) => setZ(Number(e.target.value) || 0)} className="block w-full mt-1 px-2 py-1 bg-panel border border-border-ui rounded" />
            </label>
            <div className="flex justify-end gap-2 mt-5"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => void next()}>{index + 1 === points.length ? "Finish" : "Next"}</Button></div>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-300 mt-3">{error}</p>}
    </Section>
  );
}
