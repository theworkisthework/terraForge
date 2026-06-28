import React from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Badge } from "../../../Badge";
import { Button } from "../../../ui";
import { Section } from "../Section";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";
import { StationRow } from "./StationRow";

interface InkServiceStationsSectionProps {
  controller: MachineConfigDialogController;
}

export function InkServiceStationsSection({
  controller,
}: InkServiceStationsSectionProps) {
  const {
    appConfig,
    showStationList,
    setShowStationList,
    inputCls,
    updateStationField,
    updateStationActionField,
    handleTestStationLocation,
  } = controller;

  const {
    showInkServiceStationsOnCanvas,
    inkServiceStations,
    setShowInkServiceStationsOnCanvas,
    addInkServiceStation,
    removeInkServiceStation,
    updateInkServiceStation,
  } = appConfig;

  return (
    <Section title="Paint/Ink Brush Mode">
      <div className="space-y-3">
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
              Renders Prime, Wipe, Dip, and Wash points on the bed preview to
              verify tray placement. Dipping frequency and stroke distance are
              configured in the Generate Gcode dialog.
            </p>
          </div>
        </label>

        <div className="pl-6 pt-1">
          <Button
            variant="ghost-hover"
            onClick={() => setShowStationList((open) => !open)}
            className="text-xs"
          >
            <ChevronDown
              size={14}
              className={`transition-transform duration-150 ${showStationList ? "rotate-0" : "-rotate-90"}`}
            />
            Dip Station List
          </Button>
        </div>

        {showStationList && (
          <div className="pl-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-content-faint">
                Edit coordinates in mm. Use Test to jog to a station.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={addInkServiceStation}
                title="Add Dip Station"
                aria-label="Add Dip Station"
                icon={<Plus size={12} />}
              >
                Add
              </Button>
            </div>

            {inkServiceStations.map((station) => (
              <StationRow
                key={station.id}
                station={station}
                inputCls={inputCls}
                updateInkServiceStation={updateInkServiceStation}
                updateStationField={updateStationField}
                updateStationActionField={updateStationActionField}
                handleTestStationLocation={handleTestStationLocation}
                removeInkServiceStation={removeInkServiceStation}
                canRemove={inkServiceStations.length > 1}
              />
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
