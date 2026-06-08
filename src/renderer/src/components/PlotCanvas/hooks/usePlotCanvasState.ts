import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../../../store/canvasStore";
import { useThemeStore } from "../../../store/themeStore";
import { useAppConfigStore } from "../../../store/appConfigStore";
import {
  selectPlotCanvasCanvasState,
  selectPlotCanvasToolpathState,
} from "../../../store/canvasSelectors";
import { useMachineStore } from "../../../store/machineStore";
import { useStableMachineState } from "../../../hooks/useStableMachineState";

export function usePlotCanvasState() {
  const canvas = useCanvasStore(useShallow(selectPlotCanvasCanvasState));
  const toolpath = useCanvasStore(useShallow(selectPlotCanvasToolpathState));

  const activeConfig = useMachineStore((s) => s.activeConfig);
  const theme = useThemeStore((s) => s.theme);
  const selectedJobFile = useMachineStore((s) => s.selectedJobFile);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);
  const machineStatus = useMachineStore((s) => s.status);
  const connected = useMachineStore((s) => s.connected);

  const showInkServiceStationsOnCanvas = useAppConfigStore(
    (s) => s.showInkServiceStationsOnCanvas,
  );
  const respectSvgColorsOnCanvas = useAppConfigStore(
    (s) => s.respectSvgColorsOnCanvas,
  );
  const inkServiceStations = useAppConfigStore((s) => s.inkServiceStations);

  const displayMachineState = useStableMachineState(machineStatus?.state);
  const isJobActive =
    displayMachineState === "Run" || displayMachineState === "Hold";

  return {
    canvas,
    toolpath,
    activeConfig,
    theme,
    selectedJobFile,
    setSelectedJobFile,
    machineStatus,
    connected,
    showInkServiceStationsOnCanvas,
    respectSvgColorsOnCanvas,
    inkServiceStations,
    isJobActive,
  };
}
