import { useState } from "react";
import { createBedMeshPoints } from "../../../../../../types/bedMesh";
import type { BedMesh, BedMeshPoint } from "../../../../../../types";
import { useBedMeshStore } from "../../../../store/bedMeshStore";
import { useMachineStore } from "../../../../store/machineStore";
import { Button } from "../../../ui";
import { Section } from "../Section";

export function BedMeshSection() {
  const activeConfig = useMachineStore((s) => s.activeConfig());
  const connected = useMachineStore((s) => s.connected);
  const { enabled, mesh, setEnabled, setMesh } = useBedMeshStore();
  const [open, setOpen] = useState(false);
  const [xPoints, setXPoints] = useState(mesh?.xPoints ?? 3);
  const [yPoints, setYPoints] = useState(mesh?.yPoints ?? 3);
  const [points, setPoints] = useState<BedMeshPoint[]>([]);
  const [index, setIndex] = useState(0);
  const [z, setZ] = useState(0);

  const begin = async () => {
    if (!activeConfig) return;
    const next = createBedMeshPoints(xPoints, yPoints, activeConfig.bedWidth, activeConfig.bedHeight);
    setPoints(next);
    setIndex(0);
    setZ(0);
    setOpen(true);
    await move(next[0]);
  };

  const move = async (point?: BedMeshPoint) => {
    if (point) await window.terraForge.fluidnc.sendCommand(`G0 X${point.x.toFixed(3)} Y${point.y.toFixed(3)}`);
  };

  const next = async () => {
    const updated = points.map((point, pointIndex) => pointIndex === index ? { ...point, z } : point);
    if (index + 1 < updated.length) {
      setPoints(updated);
      setIndex(index + 1);
      setZ(updated[index + 1].z);
      await move(updated[index + 1]);
      return;
    }
    const profile: BedMesh = {
      version: 1,
      name: mesh?.name ?? "Bed mesh",
      xPoints,
      yPoints,
      widthMM: activeConfig?.bedWidth ?? 0,
      heightMM: activeConfig?.bedHeight ?? 0,
      points: updated,
      createdAt: new Date().toISOString(),
    };
    setMesh(profile);
    setOpen(false);
  };

  const save = async () => {
    if (!mesh) return;
    const name = window.prompt("Bed mesh profile name", mesh.name)?.trim();
    if (!name) return;
    const path = await window.terraForge.fs.saveBedMeshDialog(`${name}.json`);
    if (path) await window.terraForge.fs.writeFile(path, JSON.stringify({ ...mesh, name }, null, 2));
    setMesh({ ...mesh, name });
  };

  const load = async () => {
    const path = await window.terraForge.fs.openBedMeshDialog();
    if (!path) return;
    const parsed = JSON.parse(await window.terraForge.fs.readFile(path)) as BedMesh;
    if (parsed.version !== 1 || !Number.isInteger(parsed.xPoints) || !Number.isInteger(parsed.yPoints) ||
        parsed.points.length !== parsed.xPoints * parsed.yPoints) {
      throw new Error("Invalid bed mesh profile");
    }
    setMesh(parsed);
    setXPoints(parsed.xPoints);
    setYPoints(parsed.yPoints);
  };

  return (
    <Section title="Bed Mesh Compensation">
      <label className="flex items-start gap-3 cursor-pointer mb-3">
        <input type="checkbox" checked={enabled && !!mesh} onChange={(e) => setEnabled(e.currentTarget.checked)} className="mt-0.5 accent-accent" />
        <span className="text-sm text-content">Enable bed mesh compensation</span>
      </label>
      <p className="text-xs text-content-faint mb-3">Bilinear Z offsets are added to generated G-code when enabled.</p>
      <div className="flex gap-2 mb-3">
        <label className="text-xs text-content-muted">X points<input aria-label="X grid points" type="number" min={2} max={32} value={xPoints} onChange={(e) => setXPoints(Math.max(2, Number(e.target.value) || 2))} className="block w-20 px-2 py-1 bg-panel border border-border-ui rounded" /></label>
        <label className="text-xs text-content-muted">Y points<input aria-label="Y grid points" type="number" min={2} max={32} value={yPoints} onChange={(e) => setYPoints(Math.max(2, Number(e.target.value) || 2))} className="block w-20 px-2 py-1 bg-panel border border-border-ui rounded" /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={begin} disabled={!connected || !activeConfig}>Calibrate grid</Button>
        <Button size="sm" variant="secondary" onClick={load}>Import JSON</Button>
        <Button size="sm" variant="secondary" onClick={save} disabled={!mesh}>Save JSON</Button>
      </div>
      {mesh && <p className="text-xs text-content-muted mt-2">Loaded: {mesh.name} ({mesh.xPoints} × {mesh.yPoints})</p>}
      {open && points[index] && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-app border border-border-ui rounded-xl shadow-2xl p-6 w-[360px]">
            <h2 className="text-lg font-semibold text-content mb-2">Calibrate point {index + 1} of {points.length}</h2>
            <p className="text-sm text-content-muted mb-4">Move to X {points[index].x.toFixed(2)}, Y {points[index].y.toFixed(2)} and adjust Z until the pen just touches the bed.</p>
            <div className="flex gap-2 mb-3">
              <Button size="sm" onClick={() => window.terraForge.fluidnc.sendCommand("$J=G91 G21 Z0.1 F300")}>Raise Z</Button>
              <Button size="sm" onClick={() => window.terraForge.fluidnc.sendCommand("$J=G91 G21 Z-0.1 F300")}>Lower Z</Button>
            </div>
            <label className="text-sm text-content">Final Z offset (mm)<input type="number" step="0.001" value={z} onChange={(e) => setZ(Number(e.target.value) || 0)} className="block w-full mt-1 px-2 py-1 bg-panel border border-border-ui rounded" /></label>
            <div className="flex justify-end gap-2 mt-5"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={next}>{index + 1 === points.length ? "Finish" : "Next"}</Button></div>
          </div>
        </div>
      )}
    </Section>
  );
}
