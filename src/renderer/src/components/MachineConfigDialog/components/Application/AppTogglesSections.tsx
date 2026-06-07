import React from "react";
import { Section } from "../Section";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";

interface AppTogglesSectionsProps {
  controller: MachineConfigDialogController;
}

export function AppTogglesSections({ controller }: AppTogglesSectionsProps) {
  const {
    appConfig,
    handleDebugLoggingChange,
  } = controller;

  const {
    enablePerPathPasses,
    debugLoggingEnabled,
    showMachineCoordinates,
    respectSvgColorsOnCanvas,
    setEnablePerPathPasses,
    setShowMachineCoordinates,
    setRespectSvgColorsOnCanvas,
  } = appConfig;

  return (
    <>
      <Section title="G-code Pass Settings">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enablePerPathPasses}
            onChange={(e) => setEnablePerPathPasses(e.currentTarget.checked)}
            className="mt-0.5 accent-accent"
          />
          <div className="space-y-1">
            <div className="text-sm text-content">
              Enable per-path pass overrides in the Properties panel
            </div>
            <p className="text-xs text-content-faint">
              Off by default. When disabled, pass settings are managed at the
              layer/colour level only.
            </p>
          </div>
        </label>
      </Section>

      <Section title="Logging">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={debugLoggingEnabled}
            onChange={(e) => handleDebugLoggingChange(e.currentTarget.checked)}
            className="mt-0.5 accent-accent"
          />
          <div className="space-y-1">
            <div className="text-sm text-content">
              Enable debug command logging in console
            </div>
            <p className="text-xs text-content-faint">
              Shows low-level command transport details (HTTP endpoint, retries,
              and response preview). Keep off for normal use.
            </p>
          </div>
        </label>
      </Section>

      <Section title="Console Display">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={showMachineCoordinates}
            onChange={(e) => setShowMachineCoordinates(e.currentTarget.checked)}
            className="mt-0.5 accent-accent"
          />
          <div className="space-y-1">
            <div className="text-sm text-content">
              Show machine coordinates alongside work coordinates
            </div>
            <p className="text-xs text-content-faint">
              When enabled, machine coordinates (MPos) appear in brackets after
              the work position in the console header.
            </p>
          </div>
        </label>
      </Section>

      <Section title="Canvas Display">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={respectSvgColorsOnCanvas}
            onChange={(e) =>
              setRespectSvgColorsOnCanvas(e.currentTarget.checked)
            }
            className="mt-0.5 accent-accent"
          />
          <div className="space-y-1">
            <div className="text-sm text-content">
              Show imported SVG colours on canvas
            </div>
            <p className="text-xs text-content-faint">
              Uses original SVG path colours in the bed preview only. G-code
              generation remains unchanged.
            </p>
          </div>
        </label>
      </Section>
    </>
  );
}
