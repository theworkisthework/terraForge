import { useAppConfigStore } from "../../../store/appConfigStore";
import { useMachineStore } from "../../../store/machineStore";

export function useMachineConfigDialogStores() {
  const enablePerPathPasses = useAppConfigStore(
    (state) => state.enablePerPathPasses,
  );
  const debugLoggingEnabled = useAppConfigStore(
    (state) => state.debugLoggingEnabled,
  );
  const showMachineCoordinates = useAppConfigStore(
    (state) => state.showMachineCoordinates,
  );
  const respectSvgColorsOnCanvas = useAppConfigStore(
    (state) => state.respectSvgColorsOnCanvas,
  );
  const vinylCuttingEnabled = useAppConfigStore(
    (state) => state.vinylCuttingEnabled,
  );
  const vinylBladeOffsetMM = useAppConfigStore(
    (state) => state.vinylBladeOffsetMM,
  );
  const vinylCornerAngleThresholdDeg = useAppConfigStore(
    (state) => state.vinylCornerAngleThresholdDeg,
  );
  const vinylMicroJogMagnitudeMM = useAppConfigStore(
    (state) => state.vinylMicroJogMagnitudeMM,
  );
  const showInkServiceStationsOnCanvas = useAppConfigStore(
    (state) => state.showInkServiceStationsOnCanvas,
  );
  const inkServiceStations = useAppConfigStore(
    (state) => state.inkServiceStations,
  );
  const setEnablePerPathPasses = useAppConfigStore(
    (state) => state.setEnablePerPathPasses,
  );
  const setDebugLoggingEnabled = useAppConfigStore(
    (state) => state.setDebugLoggingEnabled,
  );
  const setShowMachineCoordinates = useAppConfigStore(
    (state) => state.setShowMachineCoordinates,
  );
  const setRespectSvgColorsOnCanvas = useAppConfigStore(
    (state) => state.setRespectSvgColorsOnCanvas,
  );
  const setVinylCuttingEnabled = useAppConfigStore(
    (state) => state.setVinylCuttingEnabled,
  );
  const setVinylBladeOffsetMM = useAppConfigStore(
    (state) => state.setVinylBladeOffsetMM,
  );
  const setVinylCornerAngleThresholdDeg = useAppConfigStore(
    (state) => state.setVinylCornerAngleThresholdDeg,
  );
  const setVinylMicroJogMagnitudeMM = useAppConfigStore(
    (state) => state.setVinylMicroJogMagnitudeMM,
  );
  const setShowInkServiceStationsOnCanvas = useAppConfigStore(
    (state) => state.setShowInkServiceStationsOnCanvas,
  );
  const updateInkServiceStation = useAppConfigStore(
    (state) => state.updateInkServiceStation,
  );
  const addInkServiceStation = useAppConfigStore(
    (state) => state.addInkServiceStation,
  );
  const removeInkServiceStation = useAppConfigStore(
    (state) => state.removeInkServiceStation,
  );

  const machineStore = useMachineStore();

  return {
    appConfig: {
      enablePerPathPasses,
      debugLoggingEnabled,
      showMachineCoordinates,
      respectSvgColorsOnCanvas,
      vinylCuttingEnabled,
      vinylBladeOffsetMM,
      vinylCornerAngleThresholdDeg,
      vinylMicroJogMagnitudeMM,
      showInkServiceStationsOnCanvas,
      inkServiceStations,
      setEnablePerPathPasses,
      setDebugLoggingEnabled,
      setShowMachineCoordinates,
      setRespectSvgColorsOnCanvas,
      setVinylCuttingEnabled,
      setVinylBladeOffsetMM,
      setVinylCornerAngleThresholdDeg,
      setVinylMicroJogMagnitudeMM,
      setShowInkServiceStationsOnCanvas,
      updateInkServiceStation,
      addInkServiceStation,
      removeInkServiceStation,
    },
    machineStore,
  };
}
