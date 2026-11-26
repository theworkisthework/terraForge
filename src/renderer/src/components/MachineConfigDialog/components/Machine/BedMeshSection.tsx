import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { isValidBedMesh } from "../../../../../../types/bedMesh";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";
import { Badge } from "../../../Badge";
import { Button } from "../../../ui";
import { Tooltip } from "../../../Tooltip";
import { Section } from "../Section";
import { BedMeshWizard } from "./BedMeshWizard";
import { useBedMeshCalibration } from "./useBedMeshCalibration";

interface Props {
  controller: MachineConfigDialogController;
}

/**
 * Summary of the machine's bed mesh with the compensation toggle. Creating
 * a mesh happens in the calibration wizard; this section only launches it.
 */
export function BedMeshSection({ controller }: Props) {
  const [expanded, setExpanded] = useState(false);
  const calibration = useBedMeshCalibration(controller);
  const {
    form,
    connected,
    canCalibrate,
    zCompensationAvailable,
    wizardStep,
    error,
    openWizard,
    persistMesh,
  } = calibration;
  const mesh = isValidBedMesh(form.bedMesh) ? form.bedMesh : null;

  // Why Calibrate is disabled, most fundamental reason first.
  const calibrateBlocker = !zCompensationAvailable
    ? "The pen-up and pen-down commands must both move Z (e.g. G0Z5 / G0Z0). Bed mesh compensation works by adjusting Z."
    : !connected
      ? "Connect to this machine to calibrate. Calibration moves the pen to each point on the bed, so the machine must be connected."
      : !canCalibrate
        ? "You're connected to a different machine. Select the connected machine's profile to calibrate it."
        : null;

  const enableBlocker = !zCompensationAvailable
    ? "The pen-up and pen-down commands must both move Z to use bed mesh compensation."
    : !mesh
      ? "Calibrate a mesh first."
      : null;

  return (
    <Section title="Bed Mesh Compensation">
      <div className="space-y-2">
        {/* Same expandable row as Paint/Ink Stations' "Station List". */}
        <Button
          variant="ghost-hover"
          aria-expanded={expanded}
          aria-controls="bed-mesh-controls"
          onClick={() => setExpanded((value) => !value)}
          className="text-xs"
        >
          <ChevronDown
            size={14}
            className={`transition-transform duration-150 ${expanded ? "rotate-0" : "-rotate-90"}`}
          />
          Configure Mesh
          <Badge variant="warning">Experimental</Badge>
        </Button>
        {expanded && (
          <div id="bed-mesh-controls" className="space-y-3">
            <p className="text-xs text-content-faint">
              Adjusts pen height across the bed to follow a surface that isn't
              perfectly flat. Calibrating needs this machine connected: a wizard
              moves the pen to a grid of points and you set the pen height at
              each one.
            </p>

            <p className="text-sm text-content">
              {mesh ? (
                <>
                  <span className="font-semibold">{mesh.name}</span>
                  <span className="text-content-muted">
                    {" "}
                    · {mesh.xPoints} × {mesh.yPoints} points
                    {mesh.createdAt &&
                      ` · ${new Date(mesh.createdAt).toLocaleDateString()}`}
                  </span>
                </>
              ) : (
                <span className="text-content-muted">
                  No mesh set. Run calibration to create one.
                </span>
              )}
            </p>

            <div className="flex items-start gap-3">
              <Tooltip
                text={calibrateBlocker ?? "Open the calibration wizard"}
                className="shrink-0"
              >
                <Button
                  size="sm"
                  variant="primary"
                  onClick={openWizard}
                  disabled={!!calibrateBlocker}
                >
                  {mesh ? "Recalibrate…" : "Calibrate…"}
                </Button>
              </Tooltip>
              {calibrateBlocker && (
                <p className="flex items-start gap-1.5 text-xs text-content-muted">
                  <Info size={13} className="shrink-0 mt-px" />
                  <span>{calibrateBlocker}</span>
                </p>
              )}
            </div>

            <Tooltip
              text={enableBlocker ?? "Apply the mesh to generated G-code"}
              className="w-fit"
            >
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.bedMeshEnabled ?? false}
                  disabled={!!enableBlocker}
                  onChange={(e) =>
                    void persistMesh({
                      bedMeshEnabled: e.currentTarget.checked,
                    })
                  }
                  className="mt-0.5 accent-accent disabled:opacity-50"
                />
                <span
                  className={`text-sm ${enableBlocker ? "text-content-muted" : "text-content"}`}
                >
                  Enable bed mesh compensation
                </span>
              </label>
            </Tooltip>

            {error && wizardStep === "closed" && (
              <p role="alert" className="text-xs text-red-300">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
      {wizardStep !== "closed" && <BedMeshWizard calibration={calibration} />}
    </Section>
  );
}
