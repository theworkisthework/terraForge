import {
  Crosshair,
  Magnet,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import {
  ScaleHorizontalIcon,
  ScaleVerticalIcon,
} from "../../../components/generated-icons";
import { RotationStepFlyout } from "./RotationStepFlyout";
import { TransformIconButton } from "./TransformIconButton";
import type { TransformShortcutsProps } from "./TransformShortcuts.types";

export function TransformShortcuts({
  fitScale,
  fitScaleX,
  fitScaleY,
  rotStep,
  rotSteps,
  stepFlyoutOpen,
  showCentreMarker,
  ratioLocked,
  snapPresetTitle,
  canScaleToTemplate,
  templateScaleEnabled,
  templateScaleTarget,
  onFitToBed,
  onFitHorizontal,
  onFitVertical,
  onResetScale,
  onTemplateScaleEnabledChange,
  onTemplateScaleTargetChange,
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
        <>
          <div className="flex items-center gap-0.5 mb-1 -mt-1">
            <TransformIconButton
              title={`${
                templateScaleEnabled && canScaleToTemplate
                  ? templateScaleTarget === "margin"
                    ? "Fit to margin"
                    : "Fit to page"
                  : "Fit to bed"
              } (scale ${Math.round(fitScale * 1000) / 1000})`}
              onClick={onFitToBed}
            >
              <Maximize2 size={14} strokeWidth={2} />
            </TransformIconButton>
            <TransformIconButton
              title="Reset scale + ratio lock to 1:1 (1 SVG unit = 1 mm)"
              onClick={onResetScale}
            >
              <Minimize2 size={14} strokeWidth={2} />
            </TransformIconButton>

            <span className="mx-1 h-4 w-px bg-border-ui/60" />

            <TransformIconButton
              title={`Fit horizontal scale (${Math.round(fitScaleX * 1000) / 1000})`}
              onClick={onFitHorizontal}
              disabled={ratioLocked}
              className={`p-1.5 transition-colors rounded hover:bg-secondary/40 ${
                ratioLocked
                  ? "text-content-faint/40 cursor-not-allowed"
                  : "text-content-muted hover:text-content"
              }`}
            >
              <ScaleHorizontalIcon className="h-3.5 w-3.5" />
            </TransformIconButton>

            <TransformIconButton
              title={`Fit vertical scale (${Math.round(fitScaleY * 1000) / 1000})`}
              onClick={onFitVertical}
              disabled={ratioLocked}
              className={`p-1.5 transition-colors rounded hover:bg-secondary/40 ${
                ratioLocked
                  ? "text-content-faint/40 cursor-not-allowed"
                  : "text-content-muted hover:text-content"
              }`}
            >
              <ScaleVerticalIcon className="h-3.5 w-3.5" />
            </TransformIconButton>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <label className="inline-flex items-center gap-1 text-[10px] text-content-muted">
              <input
                type="checkbox"
                checked={templateScaleEnabled}
                disabled={!canScaleToTemplate}
                onChange={(e) => onTemplateScaleEnabledChange(e.target.checked)}
                className="accent-accent"
              />
              Scale to template
            </label>
            <label
              className={`inline-flex items-center gap-1 text-[10px] ${
                templateScaleEnabled && canScaleToTemplate
                  ? "text-content-default"
                  : "text-content-muted"
              }`}
            >
              <input
                type="radio"
                name="scale-template-target"
                value="page"
                aria-label="Scale to template page"
                checked={templateScaleTarget === "page"}
                disabled={!templateScaleEnabled || !canScaleToTemplate}
                onChange={() => onTemplateScaleTargetChange("page")}
                className="accent-accent"
              />
              Page
            </label>
            <label
              className={`inline-flex items-center gap-1 text-[10px] ${
                templateScaleEnabled && canScaleToTemplate
                  ? "text-content-default"
                  : "text-content-muted"
              }`}
            >
              <input
                type="radio"
                name="scale-template-target"
                value="margin"
                aria-label="Scale to template margin"
                checked={templateScaleTarget === "margin"}
                disabled={!templateScaleEnabled || !canScaleToTemplate}
                onChange={() => onTemplateScaleTargetChange("margin")}
                className="accent-accent"
              />
              Margin
            </label>
          </div>
        </>
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
