import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { isValidBedMesh, MAX_BED_MESH_GRID_POINTS } from "../../../../../../types/bedMesh";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";
import { Button } from "../../../ui";
import { Section } from "../Section";
import { clampGridPoints, useBedMeshCalibration } from "./useBedMeshCalibration";

interface Props {
  controller: MachineConfigDialogController;
}

export function BedMeshSection({ controller }: Props) {
  const [expanded, setExpanded] = useState(false);
  const {
    form, inputCls, connected, canCalibrate, open, showStartOptions,
    setStartChoice, startChoice, xPoints, yPoints, points, index, z, datumZ,
    profileName, setProfileName, error, setXPoints, setYPoints, begin,
    startCalibration, next, cancelCalibration, jogZ, jogXY, setXYZero,
    save, load, persistMesh,
  } = useBedMeshCalibration(controller);

  return (
    <Section title={
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="bed-mesh-controls"
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-2 text-left"
      >
        <ChevronDown size={14} className={`transition-transform duration-150 ${expanded ? "rotate-0" : "-rotate-90"}`} />
        Bed Mesh Compensation
      </button>
    }>
      {expanded && <div id="bed-mesh-controls" className="space-y-3">
      {!connected ? (
        <p className="text-xs text-content-faint">
          To create a mesh, connect the active machine and open this profile. You can load a saved JSON mesh while disconnected.
        </p>
      ) : !canCalibrate ? (
        <p className="text-xs text-content-faint">
          Select the connected machine profile to calibrate its bed mesh.
        </p>
      ) : (
        <p className="text-xs text-content-faint">
          Set up the machine position, then follow the guided steps to probe each grid point.
        </p>
      )}
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
      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="flex flex-col gap-1 text-xs text-content-muted">X points
          <input aria-label="X grid points" type="number" min={2} max={MAX_BED_MESH_GRID_POINTS} step={1} value={xPoints}
            onChange={(e) => setXPoints(clampGridPoints(Number(e.target.value)))} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-content-muted">Y points
          <input aria-label="Y grid points" type="number" min={2} max={MAX_BED_MESH_GRID_POINTS} step={1} value={yPoints}
            onChange={(e) => setYPoints(clampGridPoints(Number(e.target.value)))} className={inputCls} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={begin}
          disabled={!canCalibrate}
          title={!connected ? "Connect to the active machine to create a mesh." : !canCalibrate ? "Select the connected machine profile to calibrate." : undefined}
        >
          Calibrate grid
        </Button>
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
      {showStartOptions && canCalibrate && (
        <div className="rounded border border-border-ui p-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-content">Position the machine</p>
            <p className="text-xs text-content-faint mt-1">
              Jog XY to set a work zero before continuing, or home the machine. XY jogs first raise Z by 5 mm.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1 w-36 mx-auto">
            <span />
            <Button size="sm" variant="secondary" aria-label="Jog Y positive 1 mm" onClick={() => void jogXY("Y", 1)}>Y+</Button>
            <span />
            <Button size="sm" variant="secondary" aria-label="Jog X negative 1 mm" onClick={() => void jogXY("X", -1)}>X−</Button>
            <Button size="sm" variant="secondary" onClick={() => void setXYZero()}>Set XY zero</Button>
            <Button size="sm" variant="secondary" aria-label="Jog X positive 1 mm" onClick={() => void jogXY("X", 1)}>X+</Button>
            <span />
            <Button size="sm" variant="secondary" aria-label="Jog Y negative 1 mm" onClick={() => void jogXY("Y", -1)}>Y−</Button>
            <span />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setStartChoice("home")}>Home then calibrate</Button>
            <Button size="sm" variant="secondary" onClick={() => setStartChoice("known")}>Use current position</Button>
          </div>
        </div>
      )}
      {startChoice !== null && canCalibrate && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 bg-black/60">
          <div className="bg-app border border-border-ui rounded-xl shadow-2xl p-6 w-full max-w-[380px] max-h-[calc(100dvh-2rem)] overflow-y-auto my-auto">
            <h2 className="text-lg font-semibold text-content mb-2">Start bed mesh calibration?</h2>
            <p className="text-sm text-content-muted mb-4">
              The machine will raise Z by 5 mm, then move to X {(form.origin === "center" ? -form.bedWidth / 2 : 0).toFixed(2)}, Y {(form.origin === "center" ? -form.bedHeight / 2 : 0).toFixed(2)}. Homing moves to machine home first; using the current position preserves your work coordinates. Make sure the bed and pen are clear before continuing.
            </p>
            <div className="sticky bottom-0 flex justify-end gap-2 bg-app pt-3">
              <Button variant="secondary" onClick={() => setStartChoice(null)}>Cancel</Button>
              <Button onClick={() => void startCalibration(startChoice)}>Continue</Button>
            </div>
          </div>
        </div>
      )}
      {open && canCalibrate && points[index] && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 bg-black/60">
          <div className="bg-app border border-border-ui rounded-xl shadow-2xl p-6 w-full max-w-[360px] max-h-[calc(100dvh-2rem)] overflow-y-auto my-auto">
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
      </div>}
    </Section>
  );
}
