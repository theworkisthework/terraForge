import { MM_TO_PX, PAD, RULER_W } from "../constants";
import type { Vp } from "../types";

interface RulerOverlayProps {
  vp: Vp;
  bedW: number;
  bedH: number;
  origin: "bottom-left" | "top-left" | "bottom-right" | "top-right" | "center";
  containerW: number;
  containerH: number;
}

export function RulerOverlay({
  vp,
  bedW,
  bedH,
  origin,
  containerW,
  containerH,
}: RulerOverlayProps) {
  const isBottom = origin === "bottom-left" || origin === "bottom-right";
  const isRight = origin === "bottom-right" || origin === "top-right";
  const isCenter = origin === "center";
  const R = RULER_W;

  const mmToSx = (mm: number) =>
    isCenter
      ? vp.panX + (PAD + (bedW / 2 + mm) * MM_TO_PX) * vp.zoom
      : isRight
        ? vp.panX + (PAD + (bedW - mm) * MM_TO_PX) * vp.zoom
        : vp.panX + (PAD + mm * MM_TO_PX) * vp.zoom;
  const mmToSy = (mm: number) =>
    isCenter
      ? vp.panY + (PAD + (bedH / 2 - mm) * MM_TO_PX) * vp.zoom
      : isBottom
        ? vp.panY + (PAD + (bedH - mm) * MM_TO_PX) * vp.zoom
        : vp.panY + (PAD + mm * MM_TO_PX) * vp.zoom;
  const sxToMm = (sx: number) => {
    const raw = ((sx - vp.panX) / vp.zoom - PAD) / MM_TO_PX;
    if (isCenter) return raw - bedW / 2;
    return isRight ? bedW - raw : raw;
  };
  const syToMm = (sy: number) => {
    const raw = ((sy - vp.panY) / vp.zoom - PAD) / MM_TO_PX;
    if (isCenter) return bedH / 2 - raw;
    return isBottom ? bedH - raw : raw;
  };

  const pxPerMm = vp.zoom * MM_TO_PX;
  const [major, minor] =
    pxPerMm >= 30
      ? [5, 1]
      : pxPerMm >= 12
        ? [10, 2]
        : pxPerMm >= 6
          ? [20, 5]
          : pxPerMm >= 2
            ? [50, 10]
            : pxPerMm >= 0.8
              ? [100, 20]
              : [200, 50];

  const makeTicks = (
    a: number,
    b: number,
    minMm: number,
    maxMm: number,
  ): number[] => {
    const lo = Math.ceil(Math.min(a, b) / minor) * minor;
    const hi = Math.floor(Math.max(a, b) / minor) * minor;
    const out: number[] = [];
    for (let mm = lo; mm <= hi; mm += minor)
      if (mm >= minMm && mm <= maxMm) out.push(mm);
    return out;
  };

  const xSepY = isBottom || isCenter ? containerH - R : R;
  const xTickDir = isBottom || isCenter ? 1 : -1;
  const xLabelY = isBottom || isCenter ? containerH - R / 2 : R / 2;

  const ySepX = isRight ? containerW - R : R;
  const yTickDir = isRight ? 1 : -1;
  const yLabelX = isRight ? containerW - R / 2 : R / 2;
  const yStripEdgeX = isRight ? containerW - R : 0;
  const yStripTopY = isBottom || isCenter ? 0 : R;
  const yStripBotY = isBottom || isCenter ? containerH - R : containerH;

  const xTickEdge = isRight ? containerW - R : containerW;
  const xBedMin = isCenter ? -bedW / 2 : 0;
  const xBedMax = isCenter ? bedW / 2 : bedW;
  const yBedMin = isCenter ? -bedH / 2 : 0;
  const yBedMax = isCenter ? bedH / 2 : bedH;
  const xTicks = makeTicks(sxToMm(R), sxToMm(xTickEdge), xBedMin, xBedMax);
  const yTicks = makeTicks(
    syToMm(yStripTopY),
    syToMm(yStripBotY),
    yBedMin,
    yBedMax,
  );

  const TICK_COL = "var(--tf-border)";
  const LABEL_COL = "var(--tf-text-muted)";
  const ORIGIN_COL = "var(--tf-accent)";
  const BG = "var(--tf-bg-app)";
  const FONT = 9;
  const MAJOR_LEN = Math.round(R * 0.4);
  const MINOR_LEN = Math.round(R * 0.2);

  const originSx = mmToSx(0);
  const originSy = mmToSy(0);
  const originVisible =
    originSx >= R &&
    originSx <= containerW - R &&
    originSy >= yStripTopY &&
    originSy <= yStripBotY;

  const cornerX = isRight ? containerW - R : 0;
  const cornerY = isBottom || isCenter ? containerH - R : 0;

  const xSepX1 = isRight ? 0 : R;
  const xSepX2 = isRight ? containerW - R : containerW;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: containerW,
        height: containerH,
        overflow: "hidden",
        zIndex: 15,
      }}
      pointerEvents="none"
    >
      <rect
        x={xSepX1}
        y={isBottom || isCenter ? containerH - R : 0}
        width={xSepX2 - xSepX1}
        height={R}
        fill={BG}
      />
      <rect
        x={yStripEdgeX}
        y={yStripTopY}
        width={R}
        height={yStripBotY - yStripTopY}
        fill={BG}
      />
      <rect x={cornerX} y={cornerY} width={R} height={R} fill={BG} />

      <line
        x1={xSepX1}
        y1={xSepY}
        x2={xSepX2}
        y2={xSepY}
        stroke={TICK_COL}
        strokeWidth={0.5}
      />
      <line
        x1={ySepX}
        y1={yStripTopY}
        x2={ySepX}
        y2={yStripBotY}
        stroke={TICK_COL}
        strokeWidth={0.5}
      />

      {xTicks.map((mm) => {
        const sx = mmToSx(mm);
        if (sx < R || sx > xTickEdge) return null;
        const isMajor = mm % major === 0;
        const tLen = isMajor ? MAJOR_LEN : MINOR_LEN;
        const col = mm === 0 ? ORIGIN_COL : TICK_COL;
        return (
          <g key={`rx-${mm}`}>
            <line
              x1={sx}
              y1={xSepY}
              x2={sx}
              y2={xSepY + xTickDir * tLen}
              stroke={col}
              strokeWidth={0.5}
            />
            {isMajor && (
              <text
                x={sx}
                y={xLabelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={mm === 0 ? ORIGIN_COL : LABEL_COL}
                fontSize={FONT}
                fontFamily="monospace"
              >
                {mm}
              </text>
            )}
          </g>
        );
      })}

      {yTicks.map((mm) => {
        const sy = mmToSy(mm);
        if (sy < yStripTopY || sy > yStripBotY) return null;
        const isMajor = mm % major === 0;
        const tLen = isMajor ? MAJOR_LEN : MINOR_LEN;
        const col = mm === 0 ? ORIGIN_COL : TICK_COL;
        return (
          <g key={`ry-${mm}`}>
            <line
              x1={ySepX}
              y1={sy}
              x2={ySepX + yTickDir * tLen}
              y2={sy}
              stroke={col}
              strokeWidth={0.5}
            />
            {isMajor && (
              <text
                transform={`rotate(-90, ${yLabelX}, ${sy})`}
                x={yLabelX}
                y={sy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={mm === 0 ? ORIGIN_COL : LABEL_COL}
                fontSize={FONT}
                fontFamily="monospace"
              >
                {mm}
              </text>
            )}
          </g>
        );
      })}

      {originVisible && (
        <circle
          data-testid="origin-marker"
          cx={originSx}
          cy={originSy}
          r={3}
          fill={ORIGIN_COL}
          opacity={0.9}
        />
      )}
    </svg>
  );
}
