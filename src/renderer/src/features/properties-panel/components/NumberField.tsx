interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  disabled?: boolean;
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  disabled = false,
}: NumberFieldProps) {
  const inputId = `numfield-${label
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()}`;

  return (
    <div className="mb-2">
      <label
        htmlFor={inputId}
        className="block text-[10px] text-content-muted mb-0.5"
      >
        {label}
      </label>
      <input
        id={inputId}
        type="number"
        value={Math.round(value * 1000) / 1000}
        step={step}
        min={min}
        disabled={disabled}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full bg-app border border-border-ui rounded px-2 py-1 text-xs text-content focus:border-accent outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}
