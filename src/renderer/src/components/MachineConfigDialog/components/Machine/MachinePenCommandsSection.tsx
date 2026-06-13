import React from "react";
import { Button } from "../../../ui";
import { Field } from "../Field";
import { Section } from "../Section";
import { PEN_DEFAULTS } from "../../utils/machineConfigDefaults";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";

interface MachinePenCommandsSectionProps {
  controller: MachineConfigDialogController;
}

export function MachinePenCommandsSection({
  controller,
}: MachinePenCommandsSectionProps) {
  const {
    form,
    change,
    handleSwapCommands,
    handleMachineCoordinateToggle,
    softwareSolenoidUsesMachineCoordinates,
    inputCls,
  } = controller;

  return (
    <Section title="Pen Commands">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pen up command">
          <input
            type="text"
            value={form.penUpCommand}
            onChange={(e) => change({ penUpCommand: e.target.value })}
            className={inputCls + " font-mono"}
            placeholder={PEN_DEFAULTS[form.penType].penUpCommand}
          />
        </Field>
        <Field label="Pen down command">
          <input
            type="text"
            value={form.penDownCommand}
            onChange={(e) => change({ penDownCommand: e.target.value })}
            className={inputCls + " font-mono"}
            placeholder={PEN_DEFAULTS[form.penType].penDownCommand}
          />
        </Field>
        <Field label="Pen-down delay (ms)">
          <input
            type="number"
            aria-label="Pen-down delay (ms)"
            value={form.penDownDelayMs}
            min={0}
            step={1}
            disabled={form.penType === "stepper"}
            onChange={(e) =>
              change({
                penDownDelayMs: Math.max(0, Number(e.target.value)),
              })
            }
            className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
          />
        </Field>
        <Field label="Pen-up delay (ms)">
          <input
            type="number"
            aria-label="Pen-up delay (ms)"
            value={form.penUpDelayMs}
            min={0}
            step={1}
            disabled={form.penType === "stepper"}
            onChange={(e) =>
              change({
                penUpDelayMs: Math.max(0, Number(e.target.value)),
              })
            }
            className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSwapCommands}
          title="Swap pen-up and pen-down commands (useful for reversed solenoid wiring)"
          className="font-mono"
        >
          ⇕ Swap up / down
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const d = PEN_DEFAULTS[form.penType];
            change({
              penUpCommand: d.penUpCommand,
              penDownCommand: d.penDownCommand,
              penDownDelayMs: d.penDownDelayMs,
              penUpDelayMs: d.penUpDelayMs,
            });
          }}
          title="Reset to default commands for the selected pen type"
        >
          ↺ Reset to defaults
        </Button>
        <span className="text-xs text-content-faint">
          {form.penType === "solenoid-hardware"
            ? "Solenoid (Hardware): M3S0/M3S1 drive the DRV120 output"
            : form.penType === "solenoid-software"
              ? "Solenoid (Software): G0Z0/G0Z1 use FluidNC's solenoid feature"
              : "Servo / Stepper: G0 Z moves the Z axis"}
        </span>
      </div>
      {form.penType === "solenoid-software" && (
        <label className="flex items-center gap-2 text-xs text-content-faint cursor-pointer">
          <input
            type="checkbox"
            checked={softwareSolenoidUsesMachineCoordinates}
            onChange={(e) =>
              handleMachineCoordinateToggle(e.currentTarget.checked)
            }
            className="accent-accent"
          />
          <span>Use machine coordinates for pen commands (prefix G53)</span>
        </label>
      )}
      <p className="text-xs text-content-faint">
        Pen-down delay is inserted after pen-down before XY motion starts.
        Pen-up delay is inserted after pen-up before rapid travel begins. Both
        delays are ignored for stepper profiles.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Draw speed (mm/min)">
          <input
            type="number"
            value={form.drawSpeed}
            min={1}
            onChange={(e) => change({ drawSpeed: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
        <Field label="Jog speed (mm/min)">
          <input
            type="number"
            value={form.jogSpeed}
            min={1}
            onChange={(e) => change({ jogSpeed: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
      </div>
    </Section>
  );
}
