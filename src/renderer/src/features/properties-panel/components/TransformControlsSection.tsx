import { NumberField } from "./NumberField";
import { TransformShortcuts } from "./TransformShortcuts";
import type { TransformShortcutsProps } from "./TransformShortcuts.types";

interface TransformControlsSectionProps {
  scale: number;
  rotation: number;
  onChangeScale: (value: number) => void;
  onChangeRotation: (value: number) => void;
  sharedTransformProps: TransformShortcutsProps;
}

export function TransformControlsSection({
  scale,
  rotation,
  onChangeScale,
  onChangeRotation,
  sharedTransformProps,
}: TransformControlsSectionProps) {
  return (
    <>
      <NumberField
        label="Scale"
        value={scale}
        onChange={onChangeScale}
        step={0.05}
        min={0.001}
      />

      <TransformShortcuts {...sharedTransformProps} showRotationRow={false} />

      <NumberField
        label="Rotation (°)"
        value={rotation}
        onChange={onChangeRotation}
        step={1}
      />

      <TransformShortcuts {...sharedTransformProps} showScaleRow={false} />
    </>
  );
}
