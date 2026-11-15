import { useState } from "react";
import { ChevronDown, Crosshair } from "lucide-react";
import {
  isValidBedMesh,
  MAX_BED_MESH_GRID_POINTS,
  supportsBedMeshZCompensation,
} from "../../../../../../types/bedMesh";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";
import { Button } from "../../../ui";
import { StepSelector } from "../../../JogControls/StepSelector";
import { JogPad } from "../../../JogControls/JogPad";
import { JogSpeedInput } from "../../../JogControls/JogSpeedInput";
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
    step, setStep, feedrate, setFeedrate, jogging,
    profileName, setProfileName, error, setXPoints, setYPoints, begin,
    startCalibration, next, cancelCalibration, jogZ, jogXY, setXYZero,
    save, load, persistMesh,
  } = useBedMeshCalibration(controller);
  const validMesh = isValidBedMesh(form.bedMesh);
  const zCompensationAvailable = supportsBedMeshZCompensation(form);
  const invertX = form.origin === "bottom-right" || form.origin === "top-right";
  const invertY = form.origin === "top-left" || form.origin === "top-right";
  const zDirection = form.invertZJogControls ? -1 : 1;

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
          disabled={!validMesh || !zCompensationAvailable}
          title={!validMesh
            ? "Import or calibrate a valid mesh before enabling compensation."
            : !zCompensationAvailable
              ? "Both pen commands must include a Z move to use bed mesh compensation."
              : undefined}
          onChange={(e) => void persistMesh({ bedMeshEnabled: e.currentTarget.checked })}
          className="mt-0.5 accent-accent disabled:opacity-50"
        />
        <span className="text-sm text-content">Enable bed mesh compensation</span>
      </label>
      <p className="text-xs text-content-faint mb-3">
        {!zCompensationAvailable
          ? "Bed mesh compensation needs Z moves in both pen-up and pen-down commands."
          : validMesh
            ? "Generated G-code uses offsets relative to the first probe point; outside the measured area, the nearest edge offset is used."
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
                Jog XY to set a work zero before continuing, or home the machine. The first XY jog raises Z by 5 mm; later jogs keep that clearance. Keep the Z work zero unchanged while probing, and recalibrate after changing the bed or pen setup.
            </p>
          </div>
          <label className="block text-xs text-content-faint mb-1">Jog step (mm)</label>
          <StepSelector step={step} onChange={setStep} />
          <JogPad
              step={step}
              connected={canCalibrate && !jogging}
              jog={(axis, direction) => jogXY(axis as "X" | "Y", direction * step)}
              goToOrigin={setXYZero}
              invertXJogControls={invertX}
              invertYJogControls={invertY}
              centerLabel={<Crosshair size={14} />}
              centerTitle="Set XY work zero"
              centerAriaLabel="Set XY zero"
          />
          <JogSpeedInput feedrate={feedrate} onChange={setFeedrate} />
          <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={jogging} onClick={() => setStartChoice("home")}>Home then calibrate</Button>
              <Button size="sm" variant="secondary" disabled={jogging} onClick={() => setStartChoice("known")}>Use current position</Button>
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
              <Button variant="secondary" disabled={jogging} onClick={() => setStartChoice(null)}>Cancel</Button>
              <Button disabled={jogging} onClick={() => void startCalibration(startChoice)}>Continue</Button>
            </div>
          </div>
        </div>
      )}
      {open && canCalibrate && points[index] && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 bg-black/60">
          <div className="bg-app border border-border-ui rounded-xl shadow-2xl p-6 w-full max-w-[360px] max-h-[calc(100dvh-2rem)] overflow-y-auto my-auto">
            <h2 className="text-lg font-semibold text-content mb-2">Calibrate point {index + 1} of {points.length}</h2>
            <p className="text-sm text-content-muted mb-4">Adjust Z until the pen just touches the bed at X {points[index].x.toFixed(2)}, Y {points[index].y.toFixed(2)}.</p>
            <div className="mb-3">
              <label className="block text-xs text-content-faint mb-1">Jog step (mm)</label>
              <StepSelector step={step} onChange={setStep} />
            </div>
            <div className="flex gap-2 mb-3">
              <Button size="sm" disabled={jogging} onClick={() => void jogZ(step * zDirection)}>Raise Z {step} mm</Button>
              <Button size="sm" disabled={jogging} onClick={() => void jogZ(-step * zDirection)}>Lower Z {step} mm</Button>
            </div>
            <p className="text-sm text-content">
              Captured Z offset: {z.toFixed(3)} mm
              {datumZ === null && " (first point establishes the datum)"}
            </p>
            <div className="flex justify-end gap-2 mt-5"><Button variant="secondary" disabled={jogging} onClick={() => void cancelCalibration()}>Cancel</Button><Button disabled={jogging} onClick={() => void next()}>{index + 1 === points.length ? "Finish" : "Next"}</Button></div>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-300 mt-3">{error}</p>}
      </div>}
    </Section>
  );
}
