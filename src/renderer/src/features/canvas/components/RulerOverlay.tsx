import { MM_TO_PX, PAD, RULER_W } from "../constants";
import type { Vp } from "../types";

type Origin = "bottom-left" | "top-left" | "bottom-right" | "top-right" | "center";

interface RulerOverlayProps {
  vp: Vp;
  bedW: number;
  bedH: number;
  origin: Origin;
  containerW: number;
  containerH: number;
}

const TICK_COL = "var(--tf-border)";
const LABEL_COL = "var(--tf-text-muted)";
const ORIGIN_COL = "var(--tf-accent)";
const BG = "var(--tf-bg-app)";
const FONT = 9;
const MAJOR_LEN = Math.round(RULER_W * 0.4);
const MINOR_LEN = Math.round(RULER_W * 0.2);

/** Major and minor tick spacing (mm) for a zoom: finer as it zooms in. */
const TICK_STEPS: [minPxPerMm: number, major: number, minor: number][] = [
  [30, 5, 1],
  [12, 10, 2],
  [6, 20, 5],
  [2, 50, 10],
  [0.8, 100, 20],
];
function tickSpacing(pxPerMm: number): [number, number] {
  const step = TICK_STEPS.find(([min]) => pxPerMm >= min);
  return step ? [step[1], step[2]] : [200, 50];
}

/** Every minor tick between two positions (mm), within the bed. */
function makeTicks(a: number, b: number, minor: number, minMm: number, maxMm: number): number[] {
  const lo = Math.ceil(Math.min(a, b) / minor) * minor;
  const hi = Math.floor(Math.max(a, b) / minor) * minor;
  const out: number[] = [];
  for (let mm = lo; mm <= hi; mm += minor) if (mm >= minMm && mm <= maxMm) out.push(mm);
  return out;
}

/** Machine millimetres ↔ screen pixels for this origin and viewport. */
function rulerMapping(vp: Vp, bedW: number, bedH: number, origin: Origin) {
  const isBottom = origin === "bottom-left" || origin === "bottom-right";
  const isRight = origin === "bottom-right" || origin === "top-right";
  const isCenter = origin === "center";
  const toScreen = (pan: number, canvasMm: number) => pan + (PAD + canvasMm * MM_TO_PX) * vp.zoom;
  const toCanvasMm = (pan: number, screen: number) => ((screen - pan) / vp.zoom - PAD) / MM_TO_PX;
  return {
    isBottom,
    isRight,
    isCenter,
    mmToSx: (mm: number) => toScreen(vp.panX, isCenter ? bedW / 2 + mm : isRight ? bedW - mm : mm),
    mmToSy: (mm: number) => toScreen(vp.panY, isCenter ? bedH / 2 - mm : isBottom ? bedH - mm : mm),
    sxToMm: (sx: number) => {
      const raw = toCanvasMm(vp.panX, sx);
      return isCenter ? raw - bedW / 2 : isRight ? bedW - raw : raw;
    },
    syToMm: (sy: number) => {
      const raw = toCanvasMm(vp.panY, sy);
      return isCenter ? bedH / 2 - raw : isBottom ? bedH - raw : raw;
    },
  };
}

/** One axis's ticks and labels: a tick at each position, labelled at majors,
 * drawn in the accent colour at the origin. */
function RulerTicks({
  axis,
  ticks,
  toScreen,
  visible,
  major,
  sep,
  tickDir,
  labelPos,
}: {
  axis: "x" | "y";
  ticks: number[];
  toScreen: (mm: number) => number;
  visible: (screen: number) => boolean;
  major: number;
  sep: number;
  tickDir: number;
  labelPos: number;
}) {
  return (
    <>
      {ticks.map((mm) => {
        const at = toScreen(mm);
        if (!visible(at)) return null;
        const isMajor = mm % major === 0;
        const tLen = isMajor ? MAJOR_LEN : MINOR_LEN;
        const col = mm === 0 ? ORIGIN_COL : TICK_COL;
        const [lx, ly] = axis === "x" ? [at, labelPos] : [labelPos, at];
        return (
          <g key={`r${axis}-${mm}`}>
            {axis === "x" ? (
              <line x1={at} y1={sep} x2={at} y2={sep + tickDir * tLen} stroke={col} strokeWidth={0.5} />
            ) : (
              <line x1={sep} y1={at} x2={sep + tickDir * tLen} y2={at} stroke={col} strokeWidth={0.5} />
            )}
            {isMajor && (
              <text
                transform={axis === "y" ? `rotate(-90, ${lx}, ${ly})` : undefined}
                x={lx}
                y={ly}
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
    </>
  );
}

export function RulerOverlay({ vp, bedW, bedH, origin, containerW, containerH }: RulerOverlayProps) {
  const R = RULER_W;
  const { isBottom, isRight, isCenter, mmToSx, mmToSy, sxToMm, syToMm } = rulerMapping(vp, bedW, bedH, origin);
  const [major, minor] = tickSpacing(vp.zoom * MM_TO_PX);
  // The x ruler runs along the bottom for bottom and centre origins, else
  // the top; the y ruler along the right for right origins, else the left.
  const xAtBottom = isBottom || isCenter;

  const xSepY = xAtBottom ? containerH - R : R;
  const ySepX = isRight ? containerW - R : R;
  const yStripTopY = xAtBottom ? 0 : R;
  const yStripBotY = xAtBottom ? containerH - R : containerH;
  const xTickEdge = isRight ? containerW - R : containerW;
  const xSepX1 = isRight ? 0 : R;
  const xSepX2 = isRight ? containerW - R : containerW;
  const halfW = isCenter ? bedW / 2 : 0;
  const halfH = isCenter ? bedH / 2 : 0;
  const xTicks = makeTicks(sxToMm(R), sxToMm(xTickEdge), minor, -halfW, isCenter ? halfW : bedW);
  const yTicks = makeTicks(syToMm(yStripTopY), syToMm(yStripBotY), minor, -halfH, isCenter ? halfH : bedH);

  const originSx = mmToSx(0);
  const originSy = mmToSy(0);
  const originVisible = originSx >= R && originSx <= containerW - R && originSy >= yStripTopY && originSy <= yStripBotY;

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: containerW, height: containerH, overflow: "hidden", zIndex: 15 }}
      pointerEvents="none"
    >
      <rect x={xSepX1} y={xAtBottom ? containerH - R : 0} width={xSepX2 - xSepX1} height={R} fill={BG} />
      <rect x={isRight ? containerW - R : 0} y={yStripTopY} width={R} height={yStripBotY - yStripTopY} fill={BG} />
      <rect x={isRight ? containerW - R : 0} y={xAtBottom ? containerH - R : 0} width={R} height={R} fill={BG} />

      <line x1={xSepX1} y1={xSepY} x2={xSepX2} y2={xSepY} stroke={TICK_COL} strokeWidth={0.5} />
      <line x1={ySepX} y1={yStripTopY} x2={ySepX} y2={yStripBotY} stroke={TICK_COL} strokeWidth={0.5} />

      <RulerTicks
        axis="x"
        ticks={xTicks}
        toScreen={mmToSx}
        visible={(sx) => sx >= R && sx <= xTickEdge}
        major={major}
        sep={xSepY}
        tickDir={xAtBottom ? 1 : -1}
        labelPos={xAtBottom ? containerH - R / 2 : R / 2}
      />
      <RulerTicks
        axis="y"
        ticks={yTicks}
        toScreen={mmToSy}
        visible={(sy) => sy >= yStripTopY && sy <= yStripBotY}
        major={major}
        sep={ySepX}
        tickDir={isRight ? 1 : -1}
        labelPos={isRight ? containerW - R / 2 : R / 2}
      />

      {originVisible && (
        <circle data-testid="origin-marker" cx={originSx} cy={originSy} r={3} fill={ORIGIN_COL} opacity={0.9} />
      )}
    </svg>
  );
}
