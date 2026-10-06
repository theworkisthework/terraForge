import { X } from "lucide-react";
import type { SvgImport } from "../../../../../types";

type SeparationMode = NonNullable<SvgImport["bitmapSeparationMode"]>;

const MODE_OPTIONS: { value: SeparationMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "rgb", label: "RGB" },
  { value: "cmy", label: "CMY" },
  { value: "cmyk", label: "CMYK" },
  { value: "custom", label: "Custom palette" },
];

const DEFAULT_SWATCH_COLORS = ["#ff0000", "#00aa00", "#0000ff", "#ffaa00", "#aa00ff", "#00aaaa"];
function defaultSwatchColor(existingCount: number): string {
  return DEFAULT_SWATCH_COLORS[existingCount % DEFAULT_SWATCH_COLORS.length];
}

const inputClassName =
  "flex-1 bg-app border border-border-ui rounded px-1.5 py-1 text-xs text-content focus:border-accent outline-none";

export function BitmapSeparationSection({ imp, onUpdate }: { imp: SvgImport; onUpdate: (changes: Partial<SvgImport>) => void }) {
  const mode = imp.bitmapSeparationMode ?? "none";
  const palette = imp.bitmapSeparationPalette ?? [];

  const updatePalette = (next: { label: string; color: string }[]) =>
    onUpdate({ bitmapSeparationPalette: next, bitmapRendererPath: undefined, paths: [] });

  return (
    <div className="mt-2 pt-2 border-t border-border-ui/30">
      <label
        className="text-[10px] text-content-muted uppercase tracking-wider block mb-1.5"
        htmlFor={`bitmap-separation-${imp.id}`}
      >
        Colour separation
      </label>
      <select
        id={`bitmap-separation-${imp.id}`}
        aria-label="Colour separation mode"
        value={mode}
        onChange={(event) => {
          const nextMode = event.target.value as SeparationMode;
          onUpdate({
            bitmapSeparationMode: nextMode,
            bitmapSeparationPalette:
              nextMode === "custom" && palette.length === 0
                ? [{ label: "Colour 1", color: defaultSwatchColor(0) }]
                : imp.bitmapSeparationPalette,
            bitmapRendererPath: undefined,
            paths: [],
          });
        }}
        className="w-full bg-app border border-border-ui rounded px-1.5 py-1 text-xs text-content focus:border-accent outline-none"
      >
        {MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>

      {mode === "custom" && (
        <div className="mt-2 space-y-1.5">
          {palette.map((swatch, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input
                aria-label={`Swatch ${index + 1} colour`}
                type="color"
                value={swatch.color}
                onChange={(event) => {
                  const next = palette.map((entry, i) => (i === index ? { ...entry, color: event.target.value } : entry));
                  updatePalette(next);
                }}
                className="h-6 w-8 shrink-0 rounded border border-border-ui bg-app"
              />
              <input
                aria-label={`Swatch ${index + 1} label`}
                type="text"
                value={swatch.label}
                onChange={(event) => {
                  const next = palette.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry));
                  onUpdate({ bitmapSeparationPalette: next });
                }}
                className={inputClassName}
              />
              <button
                type="button"
                aria-label={`Remove swatch ${index + 1}`}
                onClick={() => updatePalette(palette.filter((_, i) => i !== index))}
                className="shrink-0 text-content-muted hover:text-red-400 transition-colors p-1"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              updatePalette([
                ...palette,
                { label: `Colour ${palette.length + 1}`, color: defaultSwatchColor(palette.length) },
              ])
            }
            className="mt-1 text-[10px] text-accent hover:underline"
          >
            + Add colour
          </button>
        </div>
      )}
    </div>
  );
}
