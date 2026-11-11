import { isValidBedMesh, MAX_BED_MESH_GRID_POINTS } from "../../../../../../types/bedMesh";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";
import { Button } from "../../../ui";
import { Section } from "../Section";
import { clampGridPoints, useBedMeshCalibration } from "./useBedMeshCalibration";

interface Props {
  controller: MachineConfigDialogController;
}

export function BedMeshSection({ controller }: Props) {
  const {
    form, inputCls, connected, canCalibrate, open, showStartOptions,
    setStartChoice, startChoice, xPoints, yPoints, points, index, z, datumZ,
    profileName, setProfileName, error, setXPoints, setYPoints, begin,
    startCalibration, next, cancelCalibration, jogZ, save, load, persistMesh,
  } = useBedMeshCalibration(controller);

  return (
    <Section title="Bed Mesh Compensation">
      <label className="flex items-start gap-3 mb-3">
        <input
          type="checkbox"
          checked={form.bedMeshEnabled ?? false}
          disabled={!isValidBedMesh(form.bedMesh)}
          title={!isValidBedMesh(form.bedMesh) ? "Import or calibrate a valid mesh before enabling compensation." : undefined}
          onChange={(e) => void persistMesh({ bedMeshEnabled: e.currentTarget.checked })}
          className="mt-0.5 accent-accent disabled:opacity-50"
        />
        <span className="text-sm text-content">Enable bed mesh compensation</span>
      </label>
      <p className="text-xs text-content-faint mb-3">
        {isValidBedMesh(form.bedMesh)
          ? "Bilinear Z offsets will be added to generated G-code for this machine."
          : "Import or calibrate a valid mesh profile before enabling compensation."}
      </p>
      <div className="flex gap-2 mb-3">
        <label className="text-xs text-content-muted">X points
          <input aria-label="X grid points" type="number" min={2} max={MAX_BED_MESH_GRID_POINTS} step={1} value={xPoints}
            onChange={(e) => setXPoints(clampGridPoints(Number(e.target.value)))} className={inputCls} />
        </label>
        <label className="text-xs text-content-muted">Y points
          <input aria-label="Y grid points" type="number" min={2} max={MAX_BED_MESH_GRID_POINTS} step={1} value={yPoints}
            onChange={(e) => setYPoints(clampGridPoints(Number(e.target.value)))} className={inputCls} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={begin} disabled={!canCalibrate}>Calibrate grid</Button>
        <Button size="sm" variant="secondary" onClick={load}>Load mesh JSON</Button>
        <Button size="sm" variant="secondary" onClick={save} disabled={!isValidBedMesh(form.bedMesh)}>Save JSON</Button>
      </div>
      {form.bedMesh && (
        <label className="block text-xs text-content-muted mt-3">
          Profile name
          <input aria-label="Bed mesh profile name" type="text" value={profileName}
            onChange={(e) => setProfileName(e.currentTarget.value)} className={inputCls} />
        </label>
      )}
      {form.bedMesh && <p className="text-xs text-content-muted mt-2">Loaded: {form.bedMesh.name} ({form.bedMesh.xPoints} × {form.bedMesh.yPoints})</p>}
      {connected && !canCalibrate && (
        <p className="text-xs text-content-faint mt-2">Select the connected machine profile to calibrate its bed mesh.</p>
      )}
      {showStartOptions && canCalibrate && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setStartChoice("home")}>Home then calibrate</Button>
          <Button size="sm" variant="secondary" onClick={() => setStartChoice("known")}>Use current position</Button>
        </div>
      )}
      {startChoice !== null && canCalibrate && (
        <div role="dialog" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-app border border-border-ui rounded-xl shadow-2xl p-6 w-[380px]">
            <h2 className="text-lg font-semibold text-content mb-2">Start bed mesh calibration?</h2>
            <p className="text-sm text-content-muted mb-4">
              The machine will raise Z by 5 mm, then move to X {(form.origin === "center" ? -form.bedWidth / 2 : 0).toFixed(2)}, Y {(form.origin === "center" ? -form.bedHeight / 2 : 0).toFixed(2)}. Homing moves to machine home first; using the current position preserves your work coordinates. Make sure the bed and pen are clear before continuing.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStartChoice(null)}>Cancel</Button>
              <Button onClick={() => void startCalibration(startChoice)}>Continue</Button>
            </div>
          </div>
        </div>
      )}
      {open && canCalibrate && points[index] && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-app border border-border-ui rounded-xl shadow-2xl p-6 w-[360px]">
            <h2 className="text-lg font-semibold text-content mb-2">Calibrate point {index + 1} of {points.length}</h2>
            <p className="text-sm text-content-muted mb-4">Adjust Z until the pen just touches the bed at X {points[index].x.toFixed(2)}, Y {points[index].y.toFixed(2)}.</p>
            <div className="flex gap-2 mb-3">
              <Button size="sm" onClick={() => void jogZ(0.1)}>Raise Z</Button>
              <Button size="sm" onClick={() => void jogZ(-0.1)}>Lower Z</Button>
            </div>
            <p className="text-sm text-content">
              Captured Z offset: {z.toFixed(3)} mm
              {datumZ === null && " (first point establishes the datum)"}
            </p>
            <div className="flex justify-end gap-2 mt-5"><Button variant="secondary" onClick={() => void cancelCalibration()}>Cancel</Button><Button onClick={() => void next()}>{index + 1 === points.length ? "Finish" : "Next"}</Button></div>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-300 mt-3">{error}</p>}
    </Section>
  );
}
