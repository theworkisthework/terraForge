import {
  ArrowLeftRight,
  ArrowUpDown,
  FlipHorizontal,
  FlipVertical,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import type { BitmapRendererFieldSchema, BitmapRendererIconName } from "../../bitmap-renderers/types";

const FIELD_ICONS: Record<BitmapRendererIconName, typeof RotateCw> = {
  "rotate-cw": RotateCw,
  "rotate-ccw": RotateCcw,
  "arrow-left-right": ArrowLeftRight,
  "arrow-up-down": ArrowUpDown,
  "flip-horizontal": FlipHorizontal,
  "flip-vertical": FlipVertical,
};

/**
 * Falls back to the control's own text when a schema names an icon this build
 * does not have. Manifest validation rejects unknown icon names before they
 * reach the panel, so this only covers an in-tree renderer written against a
 * newer icon set — but rendering `undefined` as an element type is a fatal
 * React error, and a missing glyph is not worth that.
 */
function RendererFieldIcon({ name, fallback }: { name?: BitmapRendererIconName; fallback: string }) {
  const Icon = name ? FIELD_ICONS[name] : undefined;
  if (!Icon) return <>{fallback}</>;
  return <Icon size={12} strokeWidth={2} />;
}

const inputClassName =
  "mt-1 w-full bg-app border border-border-ui rounded px-1.5 py-1 text-xs text-content focus:border-accent outline-none";

export function RendererFieldControl({
  field,
  value,
  onChange,
}: {
  field: BitmapRendererFieldSchema;
  value: number | boolean | string | undefined;
  onChange: (value: number | boolean | string) => void;
}) {
  const ariaLabel = field.ariaLabel ?? field.label;

  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-1.5 text-[10px] text-content-muted">
        <input
          aria-label={ariaLabel}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "select") {
    if (field.control === "icon-buttons") {
      return (
        <div>
          <span className="text-[10px] text-content-muted block mb-1">{field.label}</span>
          <div className="flex items-center gap-1">
            {field.options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                aria-pressed={value === option.value}
                onClick={() => onChange(option.value)}
                className={`p-1.5 rounded border transition-colors ${
                  value === option.value
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border-ui text-content-muted hover:text-content hover:bg-secondary/40"
                }`}
              >
                <RendererFieldIcon name={option.icon} fallback={option.label} />
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <label className="text-[10px] text-content-muted block">
        {field.label}
        <select
          aria-label={ariaLabel}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className={inputClassName}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  const numericValue = Number(value ?? 0);
  const clamp = (next: number) => Math.min(field.max, Math.max(field.min, next));
  return (
    <label className="text-[10px] text-content-muted block">
      {field.label}
      <div className="mt-1 flex items-center gap-1.5">
        <input
          aria-label={ariaLabel}
          type={field.control === "slider" ? "range" : "number"}
          min={field.min}
          max={field.max}
          step={field.step}
          value={numericValue}
          onChange={(event) =>
            Number.isFinite(event.target.valueAsNumber) && onChange(clamp(event.target.valueAsNumber))
          }
          className={
            field.control === "slider"
              ? "flex-1 accent-accent"
              : `${inputClassName} mt-0`
          }
        />
        {field.presets?.map((preset) => (
          <button
            key={preset.label}
            type="button"
            title={preset.label}
            aria-label={preset.ariaLabel ?? preset.label}
            onClick={() => onChange(clamp(numericValue + preset.delta))}
            className="p-1 rounded text-content-muted hover:text-accent hover:bg-secondary/40 transition-colors shrink-0"
          >
            <RendererFieldIcon name={preset.icon} fallback={preset.label} />
          </button>
        ))}
      </div>
    </label>
  );
}
