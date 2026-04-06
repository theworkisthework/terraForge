import { Lock, Unlock } from "lucide-react";

interface DimensionsRowProps {
  objW: number;
  objH: number;
  svgWidth: number;
  svgHeight: number;
  /** Whether the W:H ratio is currently locked */
  ratioLocked: boolean;
  /** imp.scaleX ?? imp.scale — used when toggling the lock */
  currentScaleX: number;
  /** imp.scaleY ?? imp.scale — used when toggling the lock */
  currentScaleY: number;
  onUpdate: (changes: {
    scale?: number;
    scaleX?: number;
    scaleY?: number;
  }) => void;
  onRatioLockedChange: (locked: boolean) => void;
}

export function DimensionsRow({
  objW,
  objH,
  svgWidth,
  svgHeight,
  ratioLocked,
  currentScaleX,
  currentScaleY,
  onUpdate,
  onRatioLockedChange,
}: DimensionsRowProps) {
  return (
    <div className="flex items-end gap-1 mb-0">
      {/* W */}
      <div className="flex-1 min-w-0 mb-2">
        <label className="block text-[10px] text-content-muted mb-0.5">
          W (mm)
        </label>
        <input
          type="number"
          value={Math.round(objW * 1000) / 1000}
          step={0.5}
          min={0.001}
          onChange={(e) => {
            const v = Math.max(0.001, +e.target.value);
            if (ratioLocked) {
              onUpdate({
                scale: v / svgWidth,
                scaleX: undefined,
                scaleY: undefined,
              });
            } else {
              onUpdate({ scaleX: v / svgWidth });
            }
          }}
          className="w-full bg-app border border-border-ui rounded px-2 py-1 text-xs text-content focus:border-accent outline-none"
        />
      </div>
      {/* Ratio lock button */}
      <button
        className={`mb-2 p-1.5 rounded transition-colors ${
          ratioLocked
            ? "text-accent hover:text-accent hover:bg-secondary/40"
            : "text-content-faint hover:text-content hover:bg-secondary/40"
        }`}
        title={
          ratioLocked
            ? "Ratio locked — click to unlock"
            : "Ratio unlocked — click to lock"
        }
        onClick={() => {
          if (ratioLocked) {
            // Unlock: split into independent scaleX/scaleY (currently identical)
            onRatioLockedChange(false);
            onUpdate({ scaleX: currentScaleX, scaleY: currentScaleY });
          } else {
            // Lock: snap back to uniform scale based on current W
            onRatioLockedChange(true);
            onUpdate({
              scale: currentScaleX,
              scaleX: undefined,
              scaleY: undefined,
            });
          }
        }}
      >
        {ratioLocked ? (
          <Lock size={12} strokeWidth={2} />
        ) : (
          <Unlock size={12} strokeWidth={2} />
        )}
      </button>
      {/* H */}
      <div className="flex-1 min-w-0 mb-2">
        <label className="block text-[10px] text-content-muted mb-0.5">
          H (mm)
        </label>
        <input
          type="number"
          value={Math.round(objH * 1000) / 1000}
          step={0.5}
          min={0.001}
          onChange={(e) => {
            const v = Math.max(0.001, +e.target.value);
            if (ratioLocked) {
              onUpdate({
                scale: v / svgHeight,
                scaleX: undefined,
                scaleY: undefined,
              });
            } else {
              onUpdate({ scaleY: v / svgHeight });
            }
          }}
          className="w-full bg-app border border-border-ui rounded px-2 py-1 text-xs text-content focus:border-accent outline-none"
        />
      </div>
    </div>
  );
}
