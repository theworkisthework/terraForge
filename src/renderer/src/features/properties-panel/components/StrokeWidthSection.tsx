interface StrokeWidthSectionProps {
  strokeWidthMM: number | undefined;
  defaultStrokeWidthMM: number;
  onChangeStrokeWidth: (value: number) => void;
}

export function StrokeWidthSection({
  strokeWidthMM,
  defaultStrokeWidthMM,
  onChangeStrokeWidth,
}: StrokeWidthSectionProps) {
  const value = strokeWidthMM ?? defaultStrokeWidthMM;

  return (
    <div className="mt-2 pt-2 border-t border-border-ui/30">
      <span className="text-[10px] text-content-muted uppercase tracking-wider block mb-1.5">
        Stroke width
      </span>
      <div className="flex min-w-0 items-center gap-2 pr-1">
        <input
          type="range"
          aria-label="Stroke width"
          min={0}
          max={10}
          step={0.1}
          value={value}
          onChange={(e) => onChangeStrokeWidth(Math.max(0, +e.target.value))}
          className="min-w-0 flex-1 accent-accent"
        />
        <input
          type="number"
          aria-label="Stroke width value"
          min={0}
          max={10}
          step={0.1}
          value={Math.round(value * 1000) / 1000}
          onChange={(e) => {
            const next = e.target.valueAsNumber;
            if (Number.isFinite(next) && next >= 0) {
              onChangeStrokeWidth(Math.max(0, next));
            }
          }}
          className="w-14 shrink-0 bg-app border border-border-ui rounded px-1.5 py-1 text-xs text-content focus:border-accent outline-none"
        />
        <span className="w-6 shrink-0 text-right text-[10px] text-content-faint">
          mm
        </span>
      </div>
    </div>
  );
}
