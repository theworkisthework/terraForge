import { NumberField } from "./NumberField";

interface PositionFieldsRowProps {
  x: number;
  y: number;
  onChangeX: (value: number) => void;
  onChangeY: (value: number) => void;
}

export function PositionFieldsRow({
  x,
  y,
  onChangeX,
  onChangeY,
}: PositionFieldsRowProps) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-0">
      <NumberField label="X (mm)" value={x} onChange={onChangeX} step={0.5} />
      <NumberField label="Y (mm)" value={y} onChange={onChangeY} step={0.5} />
    </div>
  );
}
