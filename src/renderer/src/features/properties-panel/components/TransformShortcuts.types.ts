import type { RotStep } from "../utils/rotation";

export interface TransformShortcutsProps {
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
