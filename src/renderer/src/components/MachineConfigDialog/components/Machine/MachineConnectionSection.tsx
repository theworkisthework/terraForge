import React from "react";
import type { ConnectionType } from "../../../../../types";
import type { MachineConfigDialogController } from "../../hooks/useMachineConfigDialogController";
import { Field } from "../Field";
import { Section } from "../Section";

interface MachineConnectionSectionProps {
  controller: MachineConfigDialogController;
}

export function MachineConnectionSection({
  controller,
}: MachineConnectionSectionProps) {
  const { form, portList, changeConn, inputCls } = controller;

  return (
    <Section title="Connection">
      <div className="flex gap-3 mb-3">
        {(["wifi", "usb"] as ConnectionType[]).map((ct) => (
          <label key={ct} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="connType"
              value={ct}
              checked={form.connection.type === ct}
              onChange={() =>
                changeConn({
                  type: ct,
                  ...(ct === "wifi"
                    ? { host: "fluidnc.local", port: 80 }
                    : { serialPath: portList[0] ?? "/dev/ttyUSB0" }),
                })
              }
              className="accent-accent"
            />
            <span className="text-sm text-content capitalize">{ct}</span>
          </label>
        ))}
      </div>

      {form.connection.type === "wifi" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Host / IP">
            <input
              type="text"
              value={form.connection.host ?? ""}
              onChange={(e) => changeConn({ host: e.target.value })}
              className={inputCls + " font-mono"}
              placeholder="fluidnc.local"
            />
          </Field>
          <Field label="HTTP port">
            <input
              type="number"
              value={form.connection.port ?? 80}
              min={1}
              max={65535}
              onChange={(e) => changeConn({ port: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="WS port override">
            <input
              type="number"
              value={form.connection.wsPort ?? ""}
              min={1}
              max={65535}
              placeholder={String(form.connection.port ?? 80)}
              onChange={(e) =>
                changeConn({
                  wsPort:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              className={inputCls}
            />
          </Field>
          <div className="flex items-center">
            <p className="text-xs text-content-faint">
              Leave blank to auto-detect from firmware version ([ESP800]).
              FluidNC 4.x uses the HTTP port; older ESP3D firmware uses
              <span className="font-mono text-content-muted"> 81</span>. Set
              an explicit value only if auto-detect fails.
            </p>
          </div>
        </div>
      ) : (
        <Field label="Serial port">
          {portList.length > 0 ? (
            <select
              value={form.connection.serialPath ?? ""}
              onChange={(e) => changeConn({ serialPath: e.target.value })}
              className={inputCls + " font-mono"}
            >
              {portList.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={form.connection.serialPath ?? ""}
              onChange={(e) => changeConn({ serialPath: e.target.value })}
              className={inputCls + " font-mono"}
              placeholder="/dev/ttyUSB0"
            />
          )}
        </Field>
      )}
    </Section>
  );
}
