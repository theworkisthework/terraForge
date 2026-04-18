import type { RotStep } from "../utils/rotation";

export interface TransformShortcutsProps {
  fitScale: number;
  rotStep: RotStep;
  rotSteps: readonly RotStep[];
  stepFlyoutOpen: boolean;
  showCentreMarker: boolean;
  snapPresetTitle: string;
  canScaleToTemplate: boolean;
  templateScaleEnabled: boolean;
  templateScaleTarget: "page" | "margin";
  onFitToBed: () => void;
  onResetScale: () => void;
  onTemplateScaleEnabledChange: (v: boolean) => void;
  onTemplateScaleTargetChange: (v: "page" | "margin") => void;
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
