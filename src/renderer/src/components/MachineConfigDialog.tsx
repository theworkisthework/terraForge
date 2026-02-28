/**
 * MachineConfigDialog
 *
 * Full CRUD UI for managing machine configuration profiles.
 * Opened from the Settings button in the Toolbar.
 */

import React, { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMachineStore } from "../store/machineStore";
import type {
  MachineConfig,
  ConnectionType,
  OriginType,
  PenType,
} from "../../../../types";

interface Props {
  onClose: () => void;
}

// ── Per-type pen command defaults ─────────────────────────────────────────────

const PEN_DEFAULTS: Record<
  PenType,
  { penUpCommand: string; penDownCommand: string }
> = {
  solenoid: { penUpCommand: "M3S0", penDownCommand: "M3S1" },
  servo: { penUpCommand: "G0Z15", penDownCommand: "G0Z0" },
  stepper: { penUpCommand: "G0Z15", penDownCommand: "G0Z0" },
};

const EMPTY_CONFIG: Omit<MachineConfig, "id"> = {
  name: "New Machine",
  bedWidth: 220,
  bedHeight: 200,
  origin: "bottom-left",
  penType: "solenoid",
  penUpCommand: PEN_DEFAULTS.solenoid.penUpCommand,
  penDownCommand: PEN_DEFAULTS.solenoid.penDownCommand,
  feedrate: 3000,
  connection: { type: "wifi", host: "fluidnc.local", port: 80 },
};

export function MachineConfigDialog({ onClose }: Props) {
  const {
    configs,
    activeConfigId,
    connected,
    addConfig,
    updateConfig,
    deleteConfig,
    reorderConfigs,
    setActiveConfig,
    setConfigs,
  } = useMachineStore();

  const [selectedId, setSelectedId] = useState<string | null>(
    activeConfigId ?? configs[0]?.id ?? null,
  );
  const [form, setForm] = useState<Omit<MachineConfig, "id">>(EMPTY_CONFIG);
  const [isDirty, setIsDirty] = useState(false);
  const [portList, setPortList] = useState<string[]>([]);
  const [isNew, setIsNew] = useState(false);

  // The active config cannot be edited while the machine is connected.
  // Non-active configs remain freely editable.
  const isLocked = connected && selectedId === activeConfigId && !isNew;

  // Load port list for USB connections
  useEffect(() => {
    window.terraForge.serial
      .listPorts()
      .then((ports: string[]) => setPortList(ports))
      .catch(() => setPortList([]));
  }, []);

  // Sync form with selected config
  useEffect(() => {
    if (isNew) return;
    const cfg = configs.find((c) => c.id === selectedId);
    if (cfg) {
      const { id: _id, ...rest } = cfg;
      setForm(JSON.parse(JSON.stringify(rest)));
      setIsDirty(false);
    }
  }, [selectedId, configs, isNew]);

  const change = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setIsDirty(true);
  };

  const changeConn = (patch: Partial<typeof form.connection>) => {
    setForm((f) => ({ ...f, connection: { ...f.connection, ...patch } }));
    setIsDirty(true);
  };

  // When pen type changes, auto-populate the default commands for that type.
  // If the user has already customised the commands, ask before overwriting.
  const handlePenTypeChange = (newType: PenType) => {
    const defaults = PEN_DEFAULTS[newType];
    const currentDefaults = PEN_DEFAULTS[form.penType];
    const commandsAreCustomised =
      form.penUpCommand !== currentDefaults.penUpCommand ||
      form.penDownCommand !== currentDefaults.penDownCommand;
    if (
      commandsAreCustomised &&
      !confirm(
        `Reset pen commands to defaults for "${newType}"?\n\n` +
          `Up: ${defaults.penUpCommand}\nDown: ${defaults.penDownCommand}`,
      )
    ) {
      // User declined — only change the type label, keep their commands
      change({ penType: newType });
    } else {
      change({
        penType: newType,
        penUpCommand: defaults.penUpCommand,
        penDownCommand: defaults.penDownCommand,
      });
    }
  };

  const handleSwapCommands = () => {
    change({
      penUpCommand: form.penDownCommand,
      penDownCommand: form.penUpCommand,
    });
  };

  const handleSave = async () => {
    if (isNew) {
      const id = crypto.randomUUID();
      const newCfg: MachineConfig = { id, ...form };
      await addConfig(newCfg);
      setSelectedId(id);
      setIsNew(false);
    } else if (selectedId) {
      await updateConfig(selectedId, form);
    }
    setIsDirty(false);
  };

  const handleNew = () => {
    setForm(JSON.parse(JSON.stringify(EMPTY_CONFIG)));
    setSelectedId(null);
    setIsNew(true);
    setIsDirty(false);
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!confirm("Delete this machine configuration?")) return;
    await deleteConfig(selectedId);
    const remaining = configs.filter((c) => c.id !== selectedId);
    setSelectedId(remaining[0]?.id ?? null);
    setIsNew(false);
  };

  const handleDuplicate = async () => {
    if (!selectedId) return;
    const src = configs.find((c) => c.id === selectedId);
    if (!src) return;
    const copy: MachineConfig = {
      ...JSON.parse(JSON.stringify(src)),
      id: crypto.randomUUID(),
      name: `Copy of ${src.name}`,
    };
    await addConfig(copy);
    setSelectedId(copy.id);
    setIsNew(false);
    setIsDirty(false);
  };

  const handleExport = async () => {
    try {
      const path = await window.terraForge.config.exportConfigs();
      if (path) alert(`Configs exported to:\n${path}`);
    } catch (err) {
      alert(`Export failed: ${String(err)}`);
    }
  };

  const handleImport = async () => {
    try {
      const result = await window.terraForge.config.importConfigs();
      if (result.added === 0 && result.skipped === 0) return; // cancelled
      // Reload the full config list from disk into the store
      const updated = await window.terraForge.config.getMachineConfigs();
      setConfigs(updated);
      // Select the first of the newly imported configs (they are appended)
      if (result.added > 0) {
        const newId = updated[updated.length - result.added]?.id;
        if (newId) {
          setSelectedId(newId);
          setIsNew(false);
        }
      }
      const parts: string[] = [];
      if (result.added > 0)
        parts.push(
          `${result.added} config${result.added === 1 ? "" : "s"} imported`,
        );
      if (result.skipped > 0)
        parts.push(`${result.skipped} skipped (already exist by ID or name)`);
      alert(parts.join(" • ") + ".");
    } catch (err) {
      alert(`Import failed: ${String(err)}`);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = configs.findIndex((c) => c.id === active.id);
    const newIndex = configs.findIndex((c) => c.id === over.id);
    const newOrder = arrayMove(configs, oldIndex, newIndex).map((c) => c.id);
    await reorderConfigs(newOrder);
  };

  const handleActivate = () => {
    if (selectedId) setActiveConfig(selectedId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[780px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            Machine Configurations
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar — machine list */}
          <div className="w-52 border-r border-gray-700 flex flex-col">
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
                <div className="px-4 py-2 text-sm bg-indigo-600 text-white truncate">
                  New Machine
                </div>
              )}
            </div>
            <div className="p-2 border-t border-gray-700 flex gap-1">
              <button
                onClick={handleNew}
                title="New config"
                className="flex-1 px-2 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                + New
              </button>
              <button
                onClick={handleDuplicate}
                disabled={!selectedId || isNew}
                title="Duplicate selected config"
                className="flex-1 px-2 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="flex-1 px-2 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                ↑ Export
              </button>
              <button
                onClick={handleImport}
                title="Import configs from a JSON file"
                className="flex-1 px-2 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                ↓ Import
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Locked banner */}
            {isLocked && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/40 border border-amber-700 text-amber-300 text-xs">
                <span className="text-base leading-none">🔒</span>
                <span>
                  Machine is connected — disconnect to edit the active profile.
                </span>
              </div>
            )}
            {/* Basic info — wrapped in fieldset so disabled propagates to every input */}
            <fieldset
              disabled={isLocked}
              className="space-y-6 disabled:opacity-60"
            >
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
                      onChange={(e) =>
                        change({ bedWidth: Number(e.target.value) })
                      }
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
                      <option value="solenoid">Solenoid</option>
                      <option value="servo">Servo</option>
                      <option value="stepper">Stepper</option>
                    </select>
                  </Field>
                </div>
              </Section>

              {/* Pen commands */}
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
                      onChange={(e) =>
                        change({ penDownCommand: e.target.value })
                      }
                      className={inputCls + " font-mono"}
                      placeholder={PEN_DEFAULTS[form.penType].penDownCommand}
                    />
                  </Field>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSwapCommands}
                    className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors font-mono"
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
                      });
                    }}
                    className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-400 rounded transition-colors"
                    title="Reset to default commands for the selected pen type"
                  >
                    ↺ Reset to defaults
                  </button>
                  <span className="text-xs text-gray-500">
                    {form.penType === "solenoid"
                      ? "Solenoid: M3Sn spindle speed controls the solenoid"
                      : "Servo / Stepper: G0 Z moves the Z axis"}
                  </span>
                </div>
                <Field label="Feedrate (mm/min)">
                  <input
                    type="number"
                    value={form.feedrate}
                    min={1}
                    onChange={(e) =>
                      change({ feedrate: Number(e.target.value) })
                    }
                    className={inputCls}
                  />
                </Field>
              </Section>

              {/* Connection */}
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
                        className="accent-indigo-500"
                      />
                      <span className="text-sm text-gray-300 capitalize">
                        {ct}
                      </span>
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
                      <p className="text-xs text-gray-500">
                        Leave blank to auto-detect from firmware version
                        ([ESP800]). FluidNC 4.x uses the HTTP port; older ESP3D
                        firmware uses{" "}
                        <span className="font-mono text-gray-400">81</span>. Set
                        an explicit value only if auto-detect fails.
                      </p>
                    </div>
                  </div>
                ) : (
                  <Field label="Serial port">
                    {portList.length > 0 ? (
                      <select
                        value={form.connection.serialPath ?? ""}
                        onChange={(e) =>
                          changeConn({ serialPath: e.target.value })
                        }
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
                        onChange={(e) =>
                          changeConn({ serialPath: e.target.value })
                        }
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

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
          <button
            onClick={handleActivate}
            disabled={!selectedId || isNew || connected}
            title={
              connected
                ? "Disconnect before switching the active machine"
                : undefined
            }
            className="px-4 py-2 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Set as Active
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty || isLocked}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDirty ? "Save Changes" : "Saved"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sortable config list item ────────────────────────────────────────────────

interface SortableConfigItemProps {
  config: { id: string; name: string };
  isSelected: boolean;
  isActive: boolean;
  onSelect: () => void;
}

function SortableConfigItem({
  config,
  isSelected,
  isActive,
  onSelect,
}: SortableConfigItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center group ${
        isSelected ? "bg-indigo-600" : "hover:bg-gray-800"
      }`}
    >
      {/* drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="px-2 py-2 cursor-grab active:cursor-grabbing text-gray-600 group-hover:text-gray-400 flex-shrink-0 select-none"
        title="Drag to reorder"
      >
        ⠿
      </span>
      <button
        onClick={onSelect}
        className={`flex-1 text-left py-2 pr-4 text-sm transition-colors truncate min-w-0 ${
          isSelected ? "text-white" : "text-gray-300"
        }`}
      >
        {config.name}
        {isActive && <span className="ml-1 text-xs text-green-400">✓</span>}
      </button>
    </div>
  );
}

// ── Small reusable components ─────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-600 rounded-lg text-white " +
  "focus:outline-none focus:border-indigo-500 transition-colors";
