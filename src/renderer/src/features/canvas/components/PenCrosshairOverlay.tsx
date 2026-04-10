import { useRef } from "react";
import { Crosshair } from "lucide-react";
import { MM_TO_PX, PAD } from "../constants";

interface MachineStatusLike {
  raw?: string;
  wpos?: { x: number; y: number; z: number };
  mpos: { x: number; y: number; z: number };
}

interface PenCrosshairOverlayProps {
  connected: boolean;
  machineStatus: MachineStatusLike | null;
  containerW: number;
  vp: { zoom: number; panX: number; panY: number };
  isCenter: boolean;
  isRight: boolean;
  isBottom: boolean;
  bedW: number;
  bedH: number;
}

export function PenCrosshairOverlay({
  connected,
  machineStatus,
  containerW,
  vp,
  isCenter,
  isRight,
  isBottom,
  bedW,
  bedH,
}: PenCrosshairOverlayProps) {
  const penWcoRef = useRef({ x: 0, y: 0, z: 0 });

  if (!connected || !machineStatus || containerW <= 0) return null;

  const wcoMatch = machineStatus.raw?.match(
    /WCO:([-\d.]+),([-\d.]+),([-\d.]+)/,
  );
  if (wcoMatch) {
    penWcoRef.current = {
      x: +wcoMatch[1],
      y: +wcoMatch[2],
      z: +wcoMatch[3],
    };
  }

  const hasWPos =
    /WPos:/.test(machineStatus.raw ?? "") && machineStatus.wpos != null;
  const penX = hasWPos
    ? machineStatus.wpos!.x
    : machineStatus.mpos.x - penWcoRef.current.x;
  const penY = hasWPos
    ? machineStatus.wpos!.y
    : machineStatus.mpos.y - penWcoRef.current.y;

  const svgX = isCenter
    ? PAD + (bedW / 2 + penX) * MM_TO_PX
    : isRight
      ? PAD + (bedW - penX) * MM_TO_PX
      : PAD + penX * MM_TO_PX;
  const svgY = isCenter
    ? PAD + (bedH / 2 - penY) * MM_TO_PX
    : isBottom
      ? PAD + (bedH - penY) * MM_TO_PX
      : PAD + penY * MM_TO_PX;

  const sx = vp.panX + svgX * vp.zoom;
  const sy = vp.panY + svgY * vp.zoom;

  return (
    <div
      style={{
        position: "absolute",
        left: sx,
        top: sy,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 5,
        color: "#22c55e",
        opacity: 0.9,
        filter: "drop-shadow(0 0 3px #15803d)",
      }}
    >
      <Crosshair size={24} strokeWidth={1.5} />
    </div>
  );
}
