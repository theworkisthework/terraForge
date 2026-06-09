import React from "react";
import { Badge } from "../../../Badge";
import { Field } from "../Field";
import { Section } from "../Section";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";

interface VinylCuttingSectionProps {
  controller: MachineConfigDialogController;
}

export function VinylCuttingSection({ controller }: VinylCuttingSectionProps) {
  const { appConfig, inputCls } = controller;

  const {
    vinylCuttingEnabled,
    vinylBladeOffsetMM,
    vinylCornerAngleThresholdDeg,
    vinylMicroJogMagnitudeMM,
    setVinylCuttingEnabled,
    setVinylBladeOffsetMM,
    setVinylCornerAngleThresholdDeg,
    setVinylMicroJogMagnitudeMM,
  } = appConfig;

  return (
    <Section title="Vinyl Cutting Mode">
      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={vinylCuttingEnabled}
            onChange={(e) => setVinylCuttingEnabled(e.currentTarget.checked)}
            className="mt-0.5 accent-accent"
          />
          <div className="space-y-1">
            <div className="text-sm text-content flex items-center gap-2 flex-wrap">
              <span>Enable vinyl cutting features</span>
              <Badge variant="warning">Experimental</Badge>
            </div>
            <p className="text-xs text-content-faint">
              Exposes drag-knife compensation controls in G-code generation and
              stores default compensation values here.
            </p>
          </div>
        </label>

        {vinylCuttingEnabled && (
          <div className="grid grid-cols-1 gap-3 pl-6">
            <Field label="Blade offset (mm) (Distance between blade tip and its pivot)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={vinylBladeOffsetMM}
                onChange={(e) => setVinylBladeOffsetMM(Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Corner angle threshold (degrees) (minimum angle to apply corner compensation)">
              <input
                type="number"
                min={0}
                step={1}
                value={vinylCornerAngleThresholdDeg}
                onChange={(e) =>
                  setVinylCornerAngleThresholdDeg(Number(e.target.value))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Blade rotation offset (mm) (extra movement to ensure proper blade swivel - this should be close to 0)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={vinylMicroJogMagnitudeMM}
                onChange={(e) =>
                  setVinylMicroJogMagnitudeMM(Number(e.target.value))
                }
                className={inputCls}
              />
            </Field>
          </div>
        )}
      </div>
    </Section>
  );
}
