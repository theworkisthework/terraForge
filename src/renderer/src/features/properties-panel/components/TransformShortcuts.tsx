import {
  Crosshair,
  Magnet,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { RotationStepFlyout } from "./RotationStepFlyout";
import { TransformIconButton } from "./TransformIconButton";
import type { TransformShortcutsProps } from "./TransformShortcuts.types";

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
          <TransformIconButton
            title={`Fit to bed (scale ${Math.round(fitScale * 1000) / 1000})`}
            onClick={onFitToBed}
          >
            <Maximize2 size={14} strokeWidth={2} />
          </TransformIconButton>
          <TransformIconButton
            title="Reset scale to 1:1 (1 SVG unit = 1 mm)"
            onClick={onResetScale}
          >
            <Minimize2 size={14} strokeWidth={2} />
          </TransformIconButton>
        </div>
      )}

      {showRotationRow && (
        <div className="flex items-center gap-0.5 mb-2">
          <TransformIconButton
            title={`Rotate ${rotStep}° counter-clockwise`}
            onClick={onRotateCcw}
          >
            <RotateCcw size={14} strokeWidth={2} />
          </TransformIconButton>

          <TransformIconButton
            title={`Rotate ${rotStep}° clockwise`}
            onClick={onRotateCw}
          >
            <RotateCw size={14} strokeWidth={2} />
          </TransformIconButton>

          <RotationStepFlyout
            rotStep={rotStep}
            rotSteps={rotSteps}
            stepFlyoutOpen={stepFlyoutOpen}
            onToggleStepFlyout={onToggleStepFlyout}
            onCloseStepFlyout={onCloseStepFlyout}
            onSelectRotStep={onSelectRotStep}
          />

          <span className="flex-1" />

          <TransformIconButton
            title={
              showCentreMarker ? "Hide centre marker" : "Show centre marker"
            }
            onClick={onToggleCentreMarker}
            className={`p-1.5 transition-colors rounded hover:bg-secondary/40 ${
              showCentreMarker
                ? "text-accent hover:text-accent"
                : "text-content-faint hover:text-content"
            }`}
          >
            <Crosshair size={14} strokeWidth={2} />
          </TransformIconButton>

          <TransformIconButton
            title={snapPresetTitle}
            onClick={onSnapToNextPreset}
            className="p-1.5 text-content-muted hover:text-accent transition-colors rounded hover:bg-secondary/40"
          >
            <Magnet size={14} strokeWidth={2} />
          </TransformIconButton>
        </div>
      )}
    </>
  );
}
