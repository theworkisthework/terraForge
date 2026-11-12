import React from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Badge } from "../../../Badge";
import { Button } from "../../../ui";
import { Section } from "../Section";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";
import { StationRow } from "./StationRow";

interface MachineInkStationsSectionProps {
  controller: MachineConfigDialogController;
}

/**
 * The machine's ink service stations: where its pen is primed and wiped,
 * or its brush dipped and washed. Unlike the rest of the machine's
 * settings these stay editable while it is connected, so that a station
 * can be moved, tested and moved again.
 */
export function MachineInkStationsSection({ controller }: MachineInkStationsSectionProps) {
  const { showStationList, setShowStationList, inputCls, inkStations } = controller;
  const {
    stations,
    updateStation,
    updateStationField,
    updateStationActionField,
    addStation,
    removeStation,
    handleTestStationLocation,
  } = inkStations;

  return (
    <Section title="Paint/Ink Stations">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost-hover" onClick={() => setShowStationList((open) => !open)} className="text-xs">
            <ChevronDown
              size={14}
              className={`transition-transform duration-150 ${showStationList ? "rotate-0" : "-rotate-90"}`}
            />
            Station List
            <Badge variant="warning">Experimental</Badge>
          </Button>
          {/* Hidden rather than removed while the list is closed, so that
              opening it does not move the heading row. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={addStation}
            title="Add Dip Station"
            aria-label="Add Dip Station"
            icon={<Plus size={12} />}
            className={showStationList ? undefined : "invisible"}
            disabled={!showStationList}
          >
            Add
          </Button>
        </div>

        {showStationList && (
          <div className="space-y-2">
            <p className="text-xs text-content-faint">
              Positions on this machine, in mm. Use Test to move the pen to a station. Changes take effect when
              saved.
            </p>
            {stations.map((station) => (
              <StationRow
                key={station.id}
                station={station}
                inputCls={inputCls}
                updateInkServiceStation={updateStation}
                updateStationField={updateStationField}
                updateStationActionField={updateStationActionField}
                handleTestStationLocation={handleTestStationLocation}
                removeInkServiceStation={removeStation}
                canRemove={stations.length > 1}
              />
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
