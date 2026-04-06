import {
  ChevronDown,
  Crosshair,
  Magnet,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import type { RotStep } from "../utils/rotation";

interface TransformShortcutsProps {
  fitScale: number;
  rotStep: RotStep;
  rotSteps: readonly RotStep[];
  stepFlyoutOpen: boolean;
  showCentreMarker: boolean;
  snapPresetTitle: string;
  onFitToBed: () => void;
  onResetScale: () => void;
  onRotateCcw: () => void;
  onRotateCw: () => void;
  onToggleStepFlyout: () => void;
  onCloseStepFlyout: () => void;
  onSelectRotStep: (step: RotStep) => void;
  onToggleCentreMarker: () => void;
  onSnapToNextPreset: () => void;
  showScaleRow?: boolean;
  showRotationRow?: boolean;
}

export function TransformShortcuts({
  fitScale,
  rotStep,
  rotSteps,
  stepFlyoutOpen,
  showCentreMarker,
  snapPresetTitle,
  onFitToBed,
  onResetScale,
  onRotateCcw,
  onRotateCw,
  onToggleStepFlyout,
  onCloseStepFlyout,
  onSelectRotStep,
  onToggleCentreMarker,
  onSnapToNextPreset,
  showScaleRow = true,
  showRotationRow = true,
}: TransformShortcutsProps) {
  return (
    <>
      {showScaleRow && (
        <div className="flex items-center gap-0.5 mb-2 -mt-1">
          <button
            className="p-1.5 text-content-muted hover:text-content transition-colors rounded hover:bg-secondary/40"
            title={`Fit to bed (scale ${Math.round(fitScale * 1000) / 1000})`}
            onClick={onFitToBed}
          >
            <Maximize2 size={14} />
          </button>
          <button
            className="p-1.5 text-content-muted hover:text-content transition-colors rounded hover:bg-secondary/40"
            title="Reset scale to 1:1 (1 SVG unit = 1 mm)"
            onClick={onResetScale}
          >
            <Minimize2 size={14} />
          </button>
        </div>
      )}

      {showRotationRow && (
        <div className="flex items-center gap-0.5 mb-2">
          <button
            className="p-1.5 text-content-muted hover:text-content transition-colors rounded hover:bg-secondary/40"
            title={`Rotate ${rotStep}° counter-clockwise`}
            onClick={onRotateCcw}
          >
            <RotateCcw size={14} />
          </button>

          <button
            className="p-1.5 text-content-muted hover:text-content transition-colors rounded hover:bg-secondary/40"
            title={`Rotate ${rotStep}° clockwise`}
            onClick={onRotateCw}
          >
            <RotateCw size={14} />
          </button>

          <div className="relative">
            <button
              className="flex items-center gap-0.5 px-1.5 py-1 text-[10px] text-content-muted hover:text-content rounded hover:bg-secondary/40 transition-colors"
              title="Change rotation step"
              onClick={onToggleStepFlyout}
            >
              {rotStep}°
              <ChevronDown size={10} strokeWidth={2.5} />
            </button>
            {stepFlyoutOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={onCloseStepFlyout}
                />
                <div className="absolute bottom-full left-0 mb-1 bg-panel border border-border-ui rounded shadow-xl z-20 py-0.5 min-w-[4rem]">
                  {rotSteps.map((s) => (
                    <button
                      key={s}
                      className={`block w-full text-left px-3 py-1 text-[10px] transition-colors ${
                        rotStep === s
                          ? "text-content bg-secondary"
                          : "text-content-muted hover:text-content hover:bg-secondary/50"
                      }`}
                      onClick={() => onSelectRotStep(s)}
                    >
                      {s}°
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <span className="flex-1" />

          <button
            className={`p-1.5 transition-colors rounded hover:bg-secondary/40 ${
              showCentreMarker
                ? "text-accent hover:text-accent"
                : "text-content-faint hover:text-content"
            }`}
            title={
              showCentreMarker ? "Hide centre marker" : "Show centre marker"
            }
            onClick={onToggleCentreMarker}
          >
            <Crosshair size={14} />
          </button>

          <button
            className="p-1.5 text-content-muted hover:text-accent transition-colors rounded hover:bg-secondary/40"
            title={snapPresetTitle}
            onClick={onSnapToNextPreset}
          >
            <Magnet size={14} />
          </button>
        </div>
      )}
    </>
  );
}
