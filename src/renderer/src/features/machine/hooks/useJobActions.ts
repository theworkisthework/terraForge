import { useState } from "react";
import { v4 as uuid } from "uuid";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../../../store/canvasStore";
import { selectJobActionsCanvasState } from "../../../store/canvasSelectors";
import { useTaskStore } from "../../../store/taskStore";
import { useMachineStore } from "../../../store/machineStore";
import { useAppConfigStore } from "../../../store/appConfigStore";
import { parseGcode } from "../../../utils/gcodeParser";
import { type GcodeOptions } from "../../../../../types";
import type { GcodePrefs } from "../../../components/GcodeOptionsDialog";
import { flushBitmapRenders } from "../../bitmap-renderers/bitmapRenderService";
import {
  colorFiles,
  groupFiles,
  hatchFiles,
  layerFiles,
  generateWholeJob,
  runSplitFiles,
  type SplitFile,
} from "../utils/splitGcodeFiles";
import { buildGcodeOptions } from "../utils/buildGcodeOptions";
import { connectMachine, disconnectMachine } from "../utils/machineConnection";

/** Orchestrates machine connection, disconnection, and G-code generation. */
export function useJobActions() {
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const setConnected = useMachineStore((s) => s.setConnected);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);
  const vinylCuttingEnabled = useAppConfigStore((s) => s.vinylCuttingEnabled);
  const vinylBladeOffsetMM = useAppConfigStore((s) => s.vinylBladeOffsetMM);
  const vinylCornerAngleThresholdDeg = useAppConfigStore((s) => s.vinylCornerAngleThresholdDeg);
  const vinylMicroJogMagnitudeMM = useAppConfigStore((s) => s.vinylMicroJogMagnitudeMM);
  const inkServiceStations = useAppConfigStore((s) => s.inkServiceStations);

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
  const unregisterCancelCallback = useTaskStore((s) => s.unregisterCancelCallback);

  const [isConnecting, setIsConnecting] = useState(false);
  const [generating, setGenerating] = useState(false);



  /** Connects to the active machine via Wi-Fi WebSocket or serial port. */
  const handleConnect = async () => {
    const cfg = activeConfig();
    if (!cfg) return;
    setIsConnecting(true);
    try {
      await connectMachine(cfg, upsertTask, () => setConnected(true));
    } finally {
      setIsConnecting(false);
    }
  };

  /** Disconnects from the active machine connection. */
  const handleDisconnect = async () => {
    const cfg = activeConfig();
    if (!cfg) return;
    await disconnectMachine(cfg);
    setConnected(false);
  };

  /** The worker's options, from the user's preferences and the app's state. */
  const buildOptions = async (prefs: GcodePrefs): Promise<GcodeOptions> => {
    const terraForgeVersion = await window.terraForge.app.getVersion().catch(() => "unknown");
    const { connected, fwInfo } = useMachineStore.getState();
    return buildGcodeOptions(prefs, {
      terraForgeVersion,
      firmwareVersion: connected ? (fwInfo?.replace(/^FluidNC\s+v/i, "") ?? "Unknown") : "Not connected",
      pageTemplate,
      pageSizes,
      vinyl: vinylCuttingEnabled
        ? { bladeOffsetMM: vinylBladeOffsetMM, cornerAngleThresholdDeg: vinylCornerAngleThresholdDeg, microJogMagnitudeMM: vinylMicroJogMagnitudeMM }
        : null,
      inkServiceStations,
    });
  };

  /**
   * Generates G-code for all canvas imports as a single file.
   * Routes to per-group/per-color export when enabled.
   */
  const handleGenerateGcode = async (prefs: GcodePrefs) => {
    const cfg = activeConfig();
    if (!cfg || imports.length === 0) return;

    // A bitmap setting changed moments ago may still be inside its render
    // debounce, or mid-render; generating now would plot the previous output.
    try {
      await flushBitmapRenders();
    } catch (err) {
      upsertTask({
        id: uuid(),
        type: "gcode-generate",
        label: "G-code failed",
        progress: null,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (prefs.exportPerLayer) {
      await handleGenerateGcodePerLayer(prefs, cfg);
      return;
    }

    if (prefs.exportPerColor) {
      await handleGenerateGcodePerColor(prefs, cfg);
      return;
    }

    if (prefs.exportPerGroup && layerGroups.length > 0) {
      await handleGenerateGcodePerGroup(prefs, cfg);
      return;
    }

    setGenerating(true);
    const options = await buildOptions(prefs);
    const gcode = await generateWholeJob({
      objects: useCanvasStore.getState().toVectorObjects(),
      config: cfg,
      options,
      upsertTask,
      registerCancelCallback,
      unregisterCancelCallback,
    });
    setGenerating(false);
    if (gcode === null) return;

    const filename = wholeJobFilename(prefs.optimise);
    setGcodeToolpath(parseGcode(gcode));
    selectToolpath(true);

    if (prefs.uploadToSd && useMachineStore.getState().connected) {
      const remotePath = "/" + filename;
      try {
        await window.terraForge.fluidnc.uploadGcode(uuid(), gcode, remotePath);
        setSelectedJobFile({ path: remotePath, source: "sd", name: filename });
        setGcodeSource({ path: remotePath, name: filename, source: "sd" });
      } catch {
        // Upload error is already surfaced via the upload task toast
      }
    }

    if (prefs.saveLocally) {
      const savePath = await window.terraForge.fs.saveGcodeDialog(filename);
      if (savePath) {
        await window.terraForge.fs.writeFile(savePath, gcode);
        setGcodeSource({ path: savePath, name: filename, source: "local" });
      }
    }
  };

  /** A whole job is named after the selected group or import, else the
   * first import. */
  const wholeJobFilename = (optimise: boolean) => {
    const selectedGroup = selectedGroupId ? layerGroups.find((group) => group.id === selectedGroupId) : null;
    const selectedImport = selectedImportId ? imports.find((imp) => imp.id === selectedImportId) : null;
    const baseName = selectedGroup?.name || selectedImport?.name || imports[0]?.name || "untitled";
    const safeName = baseName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_");
    return optimise ? `${safeName}_opt.gcode` : `${safeName}.gcode`;
  };

  /**
   * Generates a split job: the files `buildFiles` lists, saved to a folder
   * chosen first (if saving) and/or uploaded. `after` runs within the same
   * job, given that folder — hatch files follow colour files this way.
   */
  const generateSplit = async (
    prefs: GcodePrefs,
    cfg: ReturnType<typeof activeConfig>,
    buildFiles: () => SplitFile[],
    after?: (saveDir: string | null) => Promise<void>,
  ) => {
    if (!cfg) return;
    const options = await buildOptions(prefs);
    const files = buildFiles();
    if (files.length === 0) return;

    let saveDir: string | null = null;
    if (prefs.saveLocally) {
      saveDir = await window.terraForge.fs.chooseDirectory();
      if (!saveDir) return;
    }

    setGenerating(true);
    await runSplitFiles(files, { config: cfg, options, saveDir, upload: uploadWanted(prefs), upsertTask });
    await after?.(saveDir);
    setGenerating(false);
  };

  const uploadWanted = (prefs: GcodePrefs) => () => prefs.uploadToSd && useMachineStore.getState().connected;

  const handleGenerateGcodePerGroup = (prefs: GcodePrefs, cfg: ReturnType<typeof activeConfig>) =>
    generateSplit(prefs, cfg, () =>
      groupFiles(
        toVectorObjectsUngrouped(),
        layerGroups.map((g) => ({ name: g.name, objects: toVectorObjectsForGroup(g.id) })),
        prefs.optimise,
      ),
    );

  const handleGenerateGcodePerLayer = (prefs: GcodePrefs, cfg: ReturnType<typeof activeConfig>) =>
    generateSplit(prefs, cfg, () => layerFiles(useCanvasStore.getState().imports, prefs.optimise));

  const handleGenerateGcodePerColor = (prefs: GcodePrefs, cfg: ReturnType<typeof activeConfig>) =>
    generateSplit(
      prefs,
      cfg,
      () => colorFiles(useCanvasStore.getState().toVectorObjects(), prefs.exportPerHatch, prefs.optimise),
      async (saveDir) => {
        if (!prefs.exportPerHatch || !cfg) return;
        // Hatch-only files per colour, for hatching with a separate pen.
        const options = await buildOptions(prefs);
        const files = hatchFiles(useCanvasStore.getState().toVectorObjects(), prefs.optimise);
        await runSplitFiles(files, { config: cfg, options, saveDir, upload: uploadWanted(prefs), upsertTask });
      },
    );

  return {
    handleConnect,
    handleDisconnect,
    isConnecting,
    handleGenerateGcode,
    generating,
  };
}
