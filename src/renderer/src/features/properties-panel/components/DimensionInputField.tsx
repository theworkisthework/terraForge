interface DimensionInputFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

export function DimensionInputField({
  label,
  value,
  onChange,
}: DimensionInputFieldProps) {
  return (
    <div className="flex-1 min-w-0 mb-2">
      <label className="block text-[10px] text-content-muted mb-0.5">
        {label}
      </label>
      <input
        type="number"
        value={value}
        step={0.5}
        min={0.001}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full bg-app border border-border-ui rounded px-2 py-1 text-xs text-content focus:border-accent outline-none"
      />
    </div>
  );
}
