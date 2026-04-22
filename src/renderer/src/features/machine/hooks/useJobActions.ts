import { useState, useRef } from "react";
import { v4 as uuid } from "uuid";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../../../store/canvasStore";
import { selectJobActionsCanvasState } from "../../../store/canvasSelectors";
import { useTaskStore } from "../../../store/taskStore";
import { useMachineStore } from "../../../store/machineStore";
import { parseGcode } from "../../../utils/gcodeParser";
import { type GcodeOptions, type VectorObject } from "../../../../../types";
import type { GcodePrefs } from "../../../components/GcodeOptionsDialog";
import { normalizeSvgColor } from "../../imports/services/svgImportHelpers";

/** Orchestrates machine connection, disconnection, and G-code generation. */
export function useJobActions() {
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const setConnected = useMachineStore((s) => s.setConnected);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);

  const {
    imports,
    layerGroups,
    selectedImportId,
    selectedGroupId,
    pageTemplate,
    pageSizes,
    setGcodeToolpath,
    setGcodeSource,
    selectToolpath,
    toVectorObjectsForGroup,
    toVectorObjectsUngrouped,
  } = useCanvasStore(useShallow(selectJobActionsCanvasState));

  const upsertTask = useTaskStore((s) => s.upsertTask);
  const registerCancelCallback = useTaskStore((s) => s.registerCancelCallback);
  const unregisterCancelCallback = useTaskStore(
    (s) => s.unregisterCancelCallback,
  );

  const [isConnecting, setIsConnecting] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Holds a reference to the active G-code worker so cancellation can reach it.
  const activeWorkerRef = useRef<{ worker: Worker; taskId: string } | null>(
    null,
  );

  /** Connects to the active machine via Wi-Fi WebSocket or serial port. */
  const handleConnect = async () => {
    const cfg = activeConfig();
    if (!cfg) return;
    const taskId = uuid();
    const label =
      cfg.connection.type === "wifi"
        ? `Connecting to ${cfg.connection.host}…`
        : `Connecting to ${cfg.connection.serialPath}…`;
    upsertTask({
      id: taskId,
      type: "ws-connect",
      label,
      progress: null,
      status: "running",
    });
    setIsConnecting(true);
    try {
      if (cfg.connection.type === "wifi") {
        await window.terraForge.fluidnc.connectWebSocket(
          cfg.connection.host!,
          cfg.connection.port ?? 80,
          cfg.connection.wsPort,
        );
      } else {
        await window.terraForge.serial.connect(
          cfg.connection.serialPath!,
          115200,
        );
      }
      setConnected(true);
      upsertTask({
        id: taskId,
        type: "ws-connect",
        label: "Connected",
        progress: 100,
        status: "completed",
      });
    } catch (err) {
      console.error("Connection failed", err);
      upsertTask({
        id: taskId,
        type: "ws-connect",
        label: "Connection failed",
        progress: null,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsConnecting(false);
    }
  };

  /** Disconnects from the active machine connection. */
  const handleDisconnect = async () => {
    const cfg = activeConfig();
    if (!cfg) return;
    if (cfg.connection.type === "wifi") {
      await window.terraForge.fluidnc.disconnectWebSocket();
    } else {
      await window.terraForge.serial.disconnect();
    }
    setConnected(false);
  };

  /** Builds a GcodeOptions object from user preferences and the current page template. */
  const buildOptions = (prefs: GcodePrefs): GcodeOptions => {
    const activePageSize = pageTemplate
      ? pageSizes.find((ps) => ps.id === pageTemplate.sizeId)
      : undefined;
    return {
      arcFitting: false,
      arcTolerance: 0.01,
      optimisePaths: prefs.optimise,
      joinPaths: prefs.joinPaths,
      joinTolerance: prefs.joinTolerance,
      liftPenAtEnd: prefs.liftPenAtEnd,
      returnToHome: prefs.returnToHome,
      penDownDelayMsOverride: prefs.penDownDelayOverrideEnabled
        ? prefs.penDownDelayMs
        : undefined,
      drawSpeedOverride: prefs.drawSpeedOverrideEnabled
        ? prefs.drawSpeedOverride
        : undefined,
      customStartGcode: prefs.customStartGcode,
      customEndGcode: prefs.customEndGcode,
      pageClip:
        activePageSize && prefs.clipMode !== "none"
          ? {
              widthMM: pageTemplate!.landscape
                ? activePageSize.heightMM
                : activePageSize.widthMM,
              heightMM: pageTemplate!.landscape
                ? activePageSize.widthMM
                : activePageSize.heightMM,
              marginMM:
                prefs.clipMode === "margin"
                  ? (pageTemplate!.marginMM ?? 20)
                  : (prefs.clipOffsetMM ?? 0),
            }
          : undefined,
    };
  };

  /**
   * Generates G-code for all canvas imports as a single file.
   * Routes to per-group/per-color export when enabled.
   */
  const handleGenerateGcode = async (prefs: GcodePrefs) => {
    const cfg = activeConfig();
    if (!cfg || imports.length === 0) return;

    if (prefs.exportPerColor) {
      await handleGenerateGcodePerColor(prefs, cfg);
      return;
    }

    if (prefs.exportPerGroup && layerGroups.length > 0) {
      await handleGenerateGcodePerGroup(prefs, cfg);
      return;
    }

    setGenerating(true);
    const taskId = uuid();
    const options = buildOptions(prefs);

    const worker = new Worker(
      new URL("../../../../../workers/svgWorker.ts", import.meta.url),
      { type: "module" },
    );

    activeWorkerRef.current = { worker, taskId };

    registerCancelCallback(taskId, () => {
      worker.postMessage({ type: "cancel", taskId });
    });

    upsertTask({
      id: taskId,
      type: "gcode-generate",
      label: "Generating G-code",
      progress: 0,
      status: "running",
    });

    worker.onmessage = async (e) => {
      const msg = e.data;
      if (msg.type === "progress") {
        upsertTask({
          id: taskId,
          type: "gcode-generate",
          label: "Generating G-code",
          progress: msg.percent,
          status: "running",
        });
      } else if (msg.type === "complete") {
        worker.terminate();
        activeWorkerRef.current = null;
        unregisterCancelCallback(taskId);
        setGenerating(false);

        const selectedGroup = selectedGroupId
          ? layerGroups.find((group) => group.id === selectedGroupId)
          : null;
        const selectedImport = selectedImportId
          ? imports.find((imp) => imp.id === selectedImportId)
          : null;
        const baseName =
          selectedGroup?.name ||
          selectedImport?.name ||
          imports[0]?.name ||
          "untitled";
        const safeName = baseName
          .replace(/\.[^.]+$/, "")
          .replace(/[\\/:*?"<>|]/g, "_");
        const defaultFilename = prefs.optimise
          ? `${safeName}_opt.gcode`
          : `${safeName}.gcode`;

        upsertTask({
          id: taskId,
          type: "gcode-generate",
          label: "G-code ready",
          progress: 100,
          status: "completed",
        });

        const toolpath = parseGcode(msg.gcode);
        setGcodeToolpath(toolpath);
        selectToolpath(true);

        if (prefs.uploadToSd && useMachineStore.getState().connected) {
          const uploadTaskId = uuid();
          const remotePath = "/" + defaultFilename;
          try {
            await window.terraForge.fluidnc.uploadGcode(
              uploadTaskId,
              msg.gcode,
              remotePath,
            );
            setSelectedJobFile({
              path: remotePath,
              source: "sd",
              name: defaultFilename,
            });
            setGcodeSource({
              path: remotePath,
              name: defaultFilename,
              source: "sd",
            });
          } catch {
            // Upload error is already surfaced via the upload task toast
          }
        }

        if (prefs.saveLocally) {
          const savePath =
            await window.terraForge.fs.saveGcodeDialog(defaultFilename);
          if (savePath) {
            await window.terraForge.fs.writeFile(savePath, msg.gcode);
            setGcodeSource({
              path: savePath,
              name: defaultFilename,
              source: "local",
            });
          }
        }
      } else if (msg.type === "cancelled") {
        upsertTask({
          id: taskId,
          type: "gcode-generate",
          label: "G-code cancelled",
          progress: null,
          status: "cancelled",
        });
        worker.terminate();
        activeWorkerRef.current = null;
        unregisterCancelCallback(taskId);
        setGenerating(false);
      } else if (msg.type === "error") {
        upsertTask({
          id: taskId,
          type: "gcode-generate",
          label: "G-code failed",
          progress: null,
          status: "error",
          error: msg.error,
        });
        worker.terminate();
        activeWorkerRef.current = null;
        unregisterCancelCallback(taskId);
        setGenerating(false);
      }
    };

    worker.postMessage({
      type: "generate",
      taskId,
      objects: useCanvasStore.getState().toVectorObjects(),
      config: cfg,
      options,
    });
  };

  /**
   * Generates separate G-code files for each layer group.
   * Runs workers sequentially — one per group — and saves/uploads each output.
   */
  const handleGenerateGcodePerGroup = async (
    prefs: GcodePrefs,
    cfg: ReturnType<typeof activeConfig>,
  ) => {
    if (!cfg) return;
    const options = buildOptions(prefs);

    type GroupEntry = {
      id: string | null;
      name: string;
      objects: VectorObject[];
    };
    const ungroupedObjects = toVectorObjectsUngrouped();
    const allEntries: GroupEntry[] = [
      ...(ungroupedObjects.length > 0
        ? [{ id: null, name: "ungrouped", objects: ungroupedObjects }]
        : []),
      ...layerGroups
        .map((g) => ({
          id: g.id,
          name: g.name,
          objects: toVectorObjectsForGroup(g.id),
        }))
        .filter((e) => e.objects.length > 0),
    ];
    if (allEntries.length === 0) return;

    let saveDir: string | null = null;
    if (prefs.saveLocally) {
      saveDir = await window.terraForge.fs.chooseDirectory();
      if (!saveDir) return;
    }

    setGenerating(true);

    for (const group of allEntries) {
      const objects = group.objects;
      const taskId = uuid();
      const safeName = group.name.replace(/[\\/:*?"<>|]/g, "_");
      const defaultFilename = prefs.optimise
        ? `${safeName}_opt.gcode`
        : `${safeName}.gcode`;

      upsertTask({
        id: taskId,
        type: "gcode-generate",
        label: `Generating ${group.name}…`,
        progress: 0,
        status: "running",
      });

      const gcode = await new Promise<string | null>((resolve) => {
        const worker = new Worker(
          new URL("../../../../../workers/svgWorker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === "progress") {
            upsertTask({
              id: taskId,
              type: "gcode-generate",
              label: `Generating ${group.name}…`,
              progress: msg.percent,
              status: "running",
            });
          } else if (msg.type === "complete") {
            worker.terminate();
            upsertTask({
              id: taskId,
              type: "gcode-generate",
              label: `${group.name} ready`,
              progress: 100,
              status: "completed",
            });
            resolve(msg.gcode as string);
          } else {
            worker.terminate();
            upsertTask({
              id: taskId,
              type: "gcode-generate",
              label: `${group.name} failed`,
              progress: null,
              status: "error",
            });
            resolve(null);
          }
        };
        worker.postMessage({
          type: "generate",
          taskId,
          objects,
          config: cfg,
          options,
        });
      });

      if (!gcode) continue;

      if (prefs.saveLocally && saveDir) {
        const savePath = `${saveDir}/${defaultFilename}`;
        await window.terraForge.fs.writeFile(savePath, gcode);
      }

      if (prefs.uploadToSd && useMachineStore.getState().connected) {
        const uploadTaskId = uuid();
        const remotePath = "/" + defaultFilename;
        try {
          await window.terraForge.fluidnc.uploadGcode(
            uploadTaskId,
            gcode,
            remotePath,
          );
        } catch {
          // Upload error surfaced via upload task toast
        }
      }
    }

    setGenerating(false);
  };

  /**
   * Generates separate G-code files per source fill color.
   */
  const handleGenerateGcodePerColor = async (
    prefs: GcodePrefs,
    cfg: ReturnType<typeof activeConfig>,
  ) => {
    if (!cfg) return;
    const options = buildOptions(prefs);

    type ColorEntry = {
      color: string;
      objects: VectorObject[];
    };

    const allObjects = useCanvasStore.getState().toVectorObjects();
    const byColor = new Map<string, VectorObject[]>();

    for (const obj of allObjects) {
      const rawColor = obj.sourceColor?.trim();
      const key = rawColor ? normalizeSvgColor(rawColor) : "";
      if (!key) continue;
      const arr = byColor.get(key) ?? [];
      arr.push(obj);
      byColor.set(key, arr);
    }

    const allEntries: ColorEntry[] = Array.from(byColor.entries())
      .map(([color, objects]) => ({ color, objects }))
      .filter((e) => e.objects.length > 0)
      .sort((a, b) => a.color.localeCompare(b.color));

    if (allEntries.length === 0) return;

    let saveDir: string | null = null;
    if (prefs.saveLocally) {
      saveDir = await window.terraForge.fs.chooseDirectory();
      if (!saveDir) return;
    }

    const toColorFilenameBase = (color: string) => {
      const normalized = normalizeSvgColor(color.trim());
      const prefixed = normalized.startsWith("#")
        ? `hex-${normalized.slice(1)}`
        : normalized;
      return (
        prefixed
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9._-]/g, "_")
          .replace(/^_+|_+$/g, "") || "uncolored"
      );
    };

    setGenerating(true);

    for (const entry of allEntries) {
      const objects = entry.objects;
      const taskId = uuid();
      const safeName = toColorFilenameBase(entry.color);
      const defaultFilename = prefs.optimise
        ? `color_${safeName}_opt.gcode`
        : `color_${safeName}.gcode`;

      upsertTask({
        id: taskId,
        type: "gcode-generate",
        label: `Generating ${entry.color}…`,
        progress: 0,
        status: "running",
      });

      const gcode = await new Promise<string | null>((resolve) => {
        const worker = new Worker(
          new URL("../../../../../workers/svgWorker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === "progress") {
            upsertTask({
              id: taskId,
              type: "gcode-generate",
              label: `Generating ${entry.color}…`,
              progress: msg.percent,
              status: "running",
            });
          } else if (msg.type === "complete") {
            worker.terminate();
            upsertTask({
              id: taskId,
              type: "gcode-generate",
              label: `${entry.color} ready`,
              progress: 100,
              status: "completed",
            });
            resolve(msg.gcode as string);
          } else {
            worker.terminate();
            upsertTask({
              id: taskId,
              type: "gcode-generate",
              label: `${entry.color} failed`,
              progress: null,
              status: "error",
            });
            resolve(null);
          }
        };
        worker.postMessage({
          type: "generate",
          taskId,
          objects,
          config: cfg,
          options,
        });
      });

      if (!gcode) continue;

      if (prefs.saveLocally && saveDir) {
        const savePath = `${saveDir}/${defaultFilename}`;
        await window.terraForge.fs.writeFile(savePath, gcode);
      }

      if (prefs.uploadToSd && useMachineStore.getState().connected) {
        const uploadTaskId = uuid();
        const remotePath = "/" + defaultFilename;
        try {
          await window.terraForge.fluidnc.uploadGcode(
            uploadTaskId,
            gcode,
            remotePath,
          );
        } catch {
          // Upload error surfaced via upload task toast
        }
      }
    }

    setGenerating(false);
  };

  return {
    handleConnect,
    handleDisconnect,
    isConnecting,
    handleGenerateGcode,
    generating,
  };
}
