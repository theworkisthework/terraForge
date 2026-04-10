import { useCallback } from "react";

const GROUP_COLORS = [
  "#e94560",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
] as const;

interface UseAddLayerGroupArgs {
  groupCount: number;
  addLayerGroup: (name: string, color: string) => void;
}

export function useAddLayerGroup({
  groupCount,
  addLayerGroup,
}: UseAddLayerGroupArgs) {
  return useCallback(() => {
    const nextIndex = groupCount + 1;
    addLayerGroup(
      `Group ${nextIndex}`,
      GROUP_COLORS[groupCount % GROUP_COLORS.length],
    );
  }, [groupCount, addLayerGroup]);
}
