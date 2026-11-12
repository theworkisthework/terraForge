import React from "react";
import { Badge } from "../../../Badge";
import { Section } from "../Section";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";

interface InkServiceStationsSectionProps {
  controller: MachineConfigDialogController;
}

/**
 * Whether the canvas shows the active machine's ink service stations. The
 * stations themselves are part of each machine's configuration.
 */
export function InkServiceStationsSection({
  controller,
}: InkServiceStationsSectionProps) {
  const { showInkServiceStationsOnCanvas, setShowInkServiceStationsOnCanvas } =
    controller.appConfig;

  return (
    <Section title="Paint/Ink Brush Mode">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={showInkServiceStationsOnCanvas}
          onChange={(e) =>
            setShowInkServiceStationsOnCanvas(e.currentTarget.checked)
          }
          className="mt-0.5 accent-accent"
        />
        <div className="space-y-1">
          <div className="text-sm text-content flex items-center gap-2 flex-wrap">
            <span>Show station markers on plot canvas</span>
            <Badge variant="warning">Experimental</Badge>
          </div>
          <p className="text-xs text-content-faint">
            Renders the active machine's Prime, Wipe, Dip, and Wash points on
            the bed preview to verify tray placement. Each machine's stations
            are set on the Machines tab. Dipping frequency and stroke distance
            are configured in the Generate Gcode dialog.
          </p>
        </div>
      </label>
    </Section>
  );
}
