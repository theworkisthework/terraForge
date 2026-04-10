import { useCanvasStore } from "../../../store/canvasStore";
import { useShallow } from "zustand/react/shallow";
import { selectPropertiesPanelStoreBindingsState } from "../../../store/canvasSelectors";
import { useMachineStore } from "../../../store/machineStore";

export function usePropertiesPanelStoreBindings() {
  const canvasBindings = useCanvasStore(
    useShallow(selectPropertiesPanelStoreBindingsState),
  );
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const machineStatus = useMachineStore((s) => s.status);

  return {
    ...canvasBindings,
    activeConfig,
    machineStatus,
  };
}
