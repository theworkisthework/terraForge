import { useEffect, useRef } from "react";
import { useMachineStore } from "../../../store/machineStore";

interface GcodeSourceLike {
  path: string;
  name: string;
  source: "local" | "fs" | "sd";
}

interface UseToolpathSelectionSyncOptions {
  gcodeToolpath: unknown;
  gcodeSource: GcodeSourceLike | null;
  toolpathSelected: boolean;
  setSelectedJobFile: (file: GcodeSourceLike | null) => void;
}

export function useToolpathSelectionSync({
  gcodeToolpath,
  gcodeSource,
  toolpathSelected,
  setSelectedJobFile,
}: UseToolpathSelectionSyncOptions) {
  // Detect non-null -> null transition so removing canvas toolpath always clears local selection.
  const prevGcodeToolpathRef = useRef(gcodeToolpath);
  useEffect(() => {
    const prev = prevGcodeToolpathRef.current;
    prevGcodeToolpathRef.current = gcodeToolpath;
    if (prev !== null && gcodeToolpath === null) {
      setSelectedJobFile(null);
    }
  }, [gcodeToolpath, setSelectedJobFile]);

  // Keep selectedJobFile synchronized with canvas toolpath selection state.
  useEffect(() => {
    if (toolpathSelected && gcodeSource) {
      setSelectedJobFile({
        path: gcodeSource.path,
        name: gcodeSource.name,
        source: gcodeSource.source,
      });
    } else if (!toolpathSelected && gcodeSource) {
      const current = useMachineStore.getState().selectedJobFile;
      if (
        current?.path === gcodeSource.path &&
        gcodeSource.source === "local"
      ) {
        setSelectedJobFile(null);
      }
    }
    // Intentionally keyed to selection toggles only; source changes correspond to new toolpath loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolpathSelected]);
}
