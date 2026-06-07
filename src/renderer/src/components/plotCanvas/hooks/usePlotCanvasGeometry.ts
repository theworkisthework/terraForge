import { useMemo } from "react";
import { MM_TO_PX, PAD, RULER_W } from "../../../features/canvas";

type Origin = "bottom-left" | "bottom-right" | "top-left" | "top-right" | "center";

export function usePlotCanvasGeometry(config?: {
  bedWidth?: number;
  bedHeight?: number;
  origin?: string;
}) {
  return useMemo(() => {
    const bedW = config?.bedWidth ?? 220;
    const bedH = config?.bedHeight ?? 200;
    const origin = (config?.origin ?? "bottom-left") as Origin;

    const isBottom = origin === "bottom-left" || origin === "bottom-right";
    const isRight = origin === "bottom-right" || origin === "top-right";
    const isCenter = origin === "center";

    const bedXMin = isCenter ? -bedW / 2 : 0;
    const bedXMax = isCenter ? bedW / 2 : bedW;
    const bedYMin = isCenter ? -bedH / 2 : 0;
    const bedYMax = isCenter ? bedH / 2 : bedH;

    const canvasW = bedW * MM_TO_PX + PAD * 2;
    const canvasH = bedH * MM_TO_PX + PAD * 2;

    const fitInsets = {
      top: isBottom || isCenter ? 0 : RULER_W,
      right: isRight ? RULER_W : 0,
      bottom: isBottom || isCenter ? RULER_W : 0,
      left: isRight ? 0 : RULER_W,
    };

    const getBedY = (mmY: number) =>
      isBottom ? canvasH - PAD - mmY * MM_TO_PX : PAD + mmY * MM_TO_PX;
    const getBedX = (mmX: number) =>
      isRight ? PAD + (bedW - mmX) * MM_TO_PX : PAD + mmX * MM_TO_PX;

    return {
      bedW,
      bedH,
      origin,
      isBottom,
      isRight,
      isCenter,
      bedXMin,
      bedXMax,
      bedYMin,
      bedYMax,
      canvasW,
      canvasH,
      fitInsets,
      getBedY,
      getBedX,
    };
  }, [config?.bedHeight, config?.bedWidth, config?.origin]);
}
