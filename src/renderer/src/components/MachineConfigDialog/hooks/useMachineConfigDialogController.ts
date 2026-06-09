import { useEffect, useState } from "react";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type {
  InkServiceStation,
  InkServiceStationAction,
  MachineConfig,
  PenType,
} from "../../../../types";
import { useMachineConfigDialogStores } from "./useMachineConfigDialogStores";
import { EMPTY_CONFIG, PEN_DEFAULTS } from "../utils/machineConfigDefaults";
import {
  addMachineCoordinatePrefix,
  hasMachineCoordinatePrefix,
  removeMachineCoordinatePrefix,
} from "../utils/machineCoordinate";
import { defaultStationActionForType } from "../utils/stationDefaults";

export const inputCls =
  "w-full px-3 py-1.5 text-sm bg-panel border border-border-ui rounded-lg text-content " +
  "focus:outline-none focus:border-accent transition-colors";

export function useMachineConfigDialogController() {
  const { appConfig, machineStore } = useMachineConfigDialogStores();

  const {
    configs,
    activeConfigId,
    connected,
    setConnected,
    addConfig,
    updateConfig,
    deleteConfig,
    reorderConfigs,
    setActiveConfig,
    setConfigs,
  } = machineStore;

  const [selectedId, setSelectedId] = useState<string | null>(
    activeConfigId ?? configs[0]?.id ?? null,
  );
  const [form, setForm] = useState<Omit<MachineConfig, "id">>(EMPTY_CONFIG);
  const [isDirty, setIsDirty] = useState(false);
  const [portList, setPortList] = useState<string[]>([]);
  const [isNew, setIsNew] = useState(false);
  const [pendingPenType, setPendingPenType] = useState<PenType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStationList, setShowStationList] = useState(true);
  const [alertInfo, setAlertInfo] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const isLocked = connected && selectedId === activeConfigId && !isNew;

  useEffect(() => {
    window.terraForge.serial
      .listPorts()
      .then((ports: string[]) => setPortList(ports))
      .catch(() => setPortList([]));
  }, []);

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

  const handlePenTypeChange = (newType: PenType) => {
    const defaults = PEN_DEFAULTS[newType];
    const currentDefaults = PEN_DEFAULTS[form.penType];
    const commandsAreCustomised =
      form.penUpCommand !== currentDefaults.penUpCommand ||
      form.penDownCommand !== currentDefaults.penDownCommand;
    if (commandsAreCustomised) {
      setPendingPenType(newType);
    } else {
      change({
        penType: newType,
        penUpCommand: defaults.penUpCommand,
        penDownCommand: defaults.penDownCommand,
        penDownDelayMs: defaults.penDownDelayMs,
        penUpDelayMs: defaults.penUpDelayMs,
      });
    }
  };

  const handleSwapCommands = () => {
    change({
      penUpCommand: form.penDownCommand,
      penDownCommand: form.penUpCommand,
    });
  };

  const handleMachineCoordinateToggle = (enabled: boolean) => {
    change({
      penUpCommand: enabled
        ? addMachineCoordinatePrefix(form.penUpCommand)
        : removeMachineCoordinatePrefix(form.penUpCommand),
      penDownCommand: enabled
        ? addMachineCoordinatePrefix(form.penDownCommand)
        : removeMachineCoordinatePrefix(form.penDownCommand),
    });
  };

  const softwareSolenoidUsesMachineCoordinates =
    form.penType === "solenoid-software" &&
    hasMachineCoordinatePrefix(form.penUpCommand) &&
    hasMachineCoordinatePrefix(form.penDownCommand);

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

  const handleDelete = () => {
    if (!selectedId) return;
    setShowDeleteConfirm(true);
  };

  const doDelete = async () => {
    if (!selectedId) return;
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
      if (path)
        setAlertInfo({
          title: "Configs Exported",
          message: `Saved to:\n${path}`,
        });
    } catch (err) {
      setAlertInfo({ title: "Export Failed", message: String(err) });
    }
  };

  const handleImport = async () => {
    try {
      const result = await window.terraForge.config.importConfigs();
      if (result.added === 0 && result.skipped === 0) return;
      const updated = await window.terraForge.config.getMachineConfigs();
      setConfigs(updated);
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
      setAlertInfo({
        title: "Import Complete",
        message: parts.join(" • ") + ".",
      });
    } catch (err) {
      setAlertInfo({ title: "Import Failed", message: String(err) });
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

  const handleDebugLoggingChange = (enabled: boolean) => {
    appConfig.setDebugLoggingEnabled(enabled);
    void window.terraForge.config.saveAppConfig({
      debugLoggingEnabled: enabled,
    });
  };

  const updateStationField = <K extends keyof InkServiceStation>(
    stationId: string,
    key: K,
    value: InkServiceStation[K],
  ) => {
    appConfig.updateInkServiceStation(stationId, {
      [key]: value,
    } as Partial<InkServiceStation>);
  };

  const updateStationActionField = (
    station: InkServiceStation,
    patch: Partial<InkServiceStationAction>,
  ) => {
    const baseAction =
      station.action ?? defaultStationActionForType(station.type);
    if (!baseAction) return;
    appConfig.updateInkServiceStation(station.id, {
      action: {
        ...baseAction,
        ...patch,
      } as InkServiceStationAction,
    });
  };

  const handleTestStationLocation = async (station: InkServiceStation) => {
    if (!connected) {
      setAlertInfo({
        title: "Machine Offline",
        message: "Connect to your machine before testing station locations.",
      });
      return;
    }
    const cfg = activeConfigId
      ? configs.find((c) => c.id === activeConfigId)
      : null;
    if (!cfg) {
      setAlertInfo({
        title: "No Active Machine",
        message:
          "Set an active machine profile before testing station locations.",
      });
      return;
    }
    try {
      await window.terraForge.fluidnc.sendCommand(cfg.penUpCommand);
      await window.terraForge.fluidnc.sendCommand(
        `G0 X${station.x.toFixed(3)} Y${station.y.toFixed(3)}`,
      );
    } catch (err) {
      setAlertInfo({
        title: "Station Test Failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDisconnectForEdit = async () => {
    const activeCfg = configs.find((c) => c.id === activeConfigId);
    if (!activeCfg) return;

    if (activeCfg.connection.type === "wifi") {
      await window.terraForge.fluidnc.disconnectWebSocket();
    } else {
      await window.terraForge.serial.disconnect();
    }
    setConnected(false);
  };

  return {
    appConfig,
    machineStore,
    selectedId,
    setSelectedId,
    form,
    isDirty,
    portList,
    isNew,
    setIsNew,
    pendingPenType,
    setPendingPenType,
    showDeleteConfirm,
    setShowDeleteConfirm,
    showStationList,
    setShowStationList,
    alertInfo,
    setAlertInfo,
    isLocked,
    change,
    changeConn,
    handlePenTypeChange,
    handleSwapCommands,
    handleMachineCoordinateToggle,
    softwareSolenoidUsesMachineCoordinates,
    handleSave,
    handleNew,
    handleDelete,
    doDelete,
    handleDuplicate,
    handleExport,
    handleImport,
    sensors,
    handleDragEnd,
    handleActivate,
    handleDebugLoggingChange,
    updateStationField,
    updateStationActionField,
    handleTestStationLocation,
    handleDisconnectForEdit,
    inputCls,
  };
}

export type MachineConfigDialogController = ReturnType<
  typeof useMachineConfigDialogController
>;
