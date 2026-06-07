import React from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ConnectionType, OriginType, PenType } from "../../../../types";
import { Field } from "./Field";
import { Section } from "./Section";
import { SortableConfigItem } from "./SortableConfigItem";
import { PEN_DEFAULTS } from "../utils/machineConfigDefaults";
import type { MachineConfigDialogController } from "../hooks/useMachineConfigDialogController";

interface MachineConfigurationsTabProps {
  controller: MachineConfigDialogController;
}

export function MachineConfigurationsTab({
  controller,
}: MachineConfigurationsTabProps) {
  const {
    machineStore,
    selectedId,
    setSelectedId,
    form,
    portList,
    isNew,
    setIsNew,
    isLocked,
    showStationList,
    setShowStationList,
    change,
    changeConn,
    handlePenTypeChange,
    handleSwapCommands,
    handleMachineCoordinateToggle,
    softwareSolenoidUsesMachineCoordinates,
    handleNew,
    handleDuplicate,
    handleDelete,
    handleExport,
    handleImport,
    sensors,
    handleDragEnd,
    handleDisconnectForEdit,
    inputCls,
  } = controller;

  const {
    configs,
    activeConfigId,
    connected,
    updateInkServiceStation,
    addInkServiceStation,
    removeInkServiceStation,
    inkServiceStations,
    updateStationField,
    updateStationActionField,
    handleTestStationLocation,
  } = {
    configs: machineStore.configs,
    activeConfigId: machineStore.activeConfigId,
    connected: machineStore.connected,
    updateInkServiceStation: controller.appConfig.updateInkServiceStation,
    addInkServiceStation: controller.appConfig.addInkServiceStation,
    removeInkServiceStation: controller.appConfig.removeInkServiceStation,
    inkServiceStations: controller.appConfig.inkServiceStations,
    updateStationField: controller.updateStationField,
    updateStationActionField: controller.updateStationActionField,
    handleTestStationLocation: controller.handleTestStationLocation,
  };

  return (
    <div className="flex flex-1 min-h-0">
      <div className="w-52 border-r border-border-ui flex flex-col">
        <div className="flex-1 overflow-y-auto py-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={configs.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {configs.map((c) => (
                <SortableConfigItem
                  key={c.id}
                  config={c}
                  isSelected={selectedId === c.id && !isNew}
                  isActive={c.id === activeConfigId}
                  onSelect={() => {
                    setSelectedId(c.id);
                    setIsNew(false);
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
          {isNew && (
            <div className="px-4 py-2 text-sm bg-accent text-white truncate">
              New Machine
            </div>
          )}
        </div>
        <div className="p-2 border-t border-border-ui flex gap-1">
          <button
            onClick={handleNew}
            title="New config"
            className="flex-1 px-2 py-1.5 text-xs bg-secondary hover:bg-secondary-hover text-content rounded transition-colors"
          >
            + New
          </button>
          <button
            onClick={handleDuplicate}
            disabled={!selectedId || isNew}
            title="Duplicate selected config"
            className="flex-1 px-2 py-1.5 text-xs bg-secondary hover:bg-secondary-hover text-content rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Copy
          </button>
          <button
            onClick={handleDelete}
            disabled={!selectedId || configs.length <= 1 || isLocked}
            title={
              isLocked
                ? "Disconnect before deleting the active config"
                : "Delete selected config"
            }
            className="flex-1 px-2 py-1.5 text-xs bg-red-800 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Del
          </button>
        </div>
        <div className="px-2 pb-2 flex gap-1">
          <button
            onClick={handleExport}
            title="Export all configs to a JSON file"
            className="flex-1 px-2 py-1.5 text-xs bg-secondary hover:bg-secondary-hover text-content rounded transition-colors"
          >
            ↑ Export
          </button>
          <button
            onClick={handleImport}
            title="Import configs from a JSON file"
            className="flex-1 px-2 py-1.5 text-xs bg-secondary hover:bg-secondary-hover text-content rounded transition-colors"
          >
            ↓ Import
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLocked && (
          <button
            type="button"
            onClick={() => void handleDisconnectForEdit()}
            className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/40 border border-amber-700 text-amber-300 text-xs hover:bg-amber-900/55 transition-colors"
            title="Click to disconnect"
          >
            <span className="text-base leading-none">🔒</span>
            <span>
              Machine is connected - click to disconnect and edit the active
              profile.
            </span>
          </button>
        )}
        <fieldset disabled={isLocked} className="space-y-6 disabled:opacity-60">
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
                  onChange={(e) =>
                    change({ bedHeight: Number(e.target.value) })
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Origin">
                <select
                  value={form.origin}
                  onChange={(e) =>
                    change({ origin: e.target.value as OriginType })
                  }
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
                  onChange={(e) =>
                    handlePenTypeChange(e.target.value as PenType)
                  }
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
              <button
                type="button"
                onClick={handleSwapCommands}
                className="px-3 py-1.5 text-xs bg-secondary hover:bg-secondary-hover text-content rounded transition-colors font-mono"
                title="Swap pen-up and pen-down commands (useful for reversed solenoid wiring)"
              >
                ⇕ Swap up / down
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = PEN_DEFAULTS[form.penType];
                  change({
                    penUpCommand: d.penUpCommand,
                    penDownCommand: d.penDownCommand,
                    penDownDelayMs: d.penDownDelayMs,
                    penUpDelayMs: d.penUpDelayMs,
                  });
                }}
                className="px-3 py-1.5 text-xs bg-secondary hover:bg-secondary-hover text-content-muted rounded transition-colors"
                title="Reset to default commands for the selected pen type"
              >
                ↺ Reset to defaults
              </button>
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
                <span>
                  Use machine coordinates for pen commands (prefix G53)
                </span>
              </label>
            )}
            <p className="text-xs text-content-faint">
              Pen-down delay is inserted after pen-down before XY motion starts.
              Pen-up delay is inserted after pen-up before rapid travel begins.
              Both delays are ignored for stepper profiles.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Draw speed (mm/min)">
                <input
                  type="number"
                  value={form.drawSpeed}
                  min={1}
                  onChange={(e) =>
                    change({ drawSpeed: Number(e.target.value) })
                  }
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

          <Section title="Connection">
            <div className="flex gap-3 mb-3">
              {(["wifi", "usb"] as ConnectionType[]).map((ct) => (
                <label
                  key={ct}
                  className="flex items-center gap-2 cursor-pointer"
                >
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
                    onChange={(e) =>
                      changeConn({ port: Number(e.target.value) })
                    }
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
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    className={inputCls}
                  />
                </Field>
                <div className="flex items-center">
                  <p className="text-xs text-content-faint">
                    Leave blank to auto-detect from firmware version ([ESP800]).
                    FluidNC 4.x uses the HTTP port; older ESP3D firmware uses
                    <span className="font-mono text-content-muted"> 81</span>.
                    Set an explicit value only if auto-detect fails.
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
        </fieldset>
      </div>
    </div>
  );
}
