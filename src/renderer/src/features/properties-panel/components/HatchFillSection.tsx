import type { SvgImport } from "../../../../types";
import { NumberField } from "./NumberField";

interface HatchFillSectionProps {
  imp: SvgImport;
  defaultSpacingMM: number;
  defaultAngleDeg: number;
  onApplyHatch: (
    importId: string,
    spacingMM: number,
    angleDeg: number,
    enabled: boolean,
  ) => void;
}

export function HatchFillSection({
  imp,
  defaultSpacingMM,
  defaultAngleDeg,
  onApplyHatch,
}: HatchFillSectionProps) {
  const hasFilled = imp.paths.some((p) => p.hasFill);
  if (!hasFilled) return null;

  return (
    <div className="mt-2 pt-2 border-t border-border-ui/30">
      <div className="flex items-center gap-2 mb-2">
        <span
          id={`hatch-label-${imp.id}`}
          className="text-[10px] text-content-muted uppercase tracking-wider flex-1"
        >
          Hatch fill
        </span>
        <button
          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors ${
            imp.hatchEnabled ? "bg-accent" : "bg-secondary"
          }`}
          role="switch"
          aria-checked={imp.hatchEnabled}
          aria-labelledby={`hatch-label-${imp.id}`}
          onClick={() =>
            onApplyHatch(
              imp.id,
              imp.hatchSpacingMM ?? defaultSpacingMM,
              imp.hatchAngleDeg ?? defaultAngleDeg,
              !imp.hatchEnabled,
            )
          }
        >
          <span
            className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform mt-0.5 ${
              imp.hatchEnabled ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {imp.hatchEnabled && (
        <div>
          <NumberField
            label="Spacing (mm)"
            value={imp.hatchSpacingMM ?? defaultSpacingMM}
            onChange={(v) => {
              if (!Number.isFinite(v)) return;
              onApplyHatch(
                imp.id,
                Math.max(0.1, v),
                imp.hatchAngleDeg ?? defaultAngleDeg,
                true,
              );
            }}
            step={0.1}
            min={0.1}
          />
          <NumberField
            label="Angle (°)"
            value={imp.hatchAngleDeg ?? defaultAngleDeg}
            onChange={(v) => {
              if (!Number.isFinite(v)) return;
              onApplyHatch(
                imp.id,
                imp.hatchSpacingMM ?? defaultSpacingMM,
                ((v % 180) + 180) % 180,
                true,
              );
            }}
            step={5}
          />
        </div>
      )}
    </div>
  );
}
