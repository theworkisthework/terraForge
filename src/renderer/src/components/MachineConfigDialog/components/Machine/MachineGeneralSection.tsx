import React from "react";
import type { OriginType, PenType } from "../../../../../types";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";
import { Field } from "../Field";
import { Section } from "../Section";

interface MachineGeneralSectionProps {
  controller: MachineConfigDialogController;
}

export function MachineGeneralSection({ controller }: MachineGeneralSectionProps) {
  const { form, change, handlePenTypeChange, inputCls } = controller;

  return (
    <Section title="General">
      <Field label="Name">
        <input
          type="text"
          value={form.name}
          onChange={(e) => change({ name: e.target.value })}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bed width (mm)">
          <input
            type="number"
            value={form.bedWidth}
            min={1}
            onChange={(e) => change({ bedWidth: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
        <Field label="Bed height (mm)">
          <input
            type="number"
            value={form.bedHeight}
            min={1}
            onChange={(e) => change({ bedHeight: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
        <Field label="Origin">
          <select
            value={form.origin}
            onChange={(e) => change({ origin: e.target.value as OriginType })}
            className={inputCls}
          >
            <option value="bottom-left">Bottom-left</option>
            <option value="top-left">Top-left</option>
            <option value="bottom-right">Bottom-right</option>
            <option value="top-right">Top-right</option>
            <option value="center">Center</option>
          </select>
        </Field>
        <Field label="Pen type">
          <select
            value={form.penType}
            onChange={(e) => handlePenTypeChange(e.target.value as PenType)}
            className={inputCls}
          >
            <option value="solenoid-hardware">Solenoid (Hardware)</option>
            <option value="solenoid-software">Solenoid (Software)</option>
            <option value="servo">Servo</option>
            <option value="stepper">Stepper</option>
          </select>
        </Field>
      </div>
    </Section>
  );
}
