import type { SvgImport } from "../../../../types";

interface PlotPointsSectionProps {
  imp: SvgImport;
  onUpdate: (changes: Partial<SvgImport>) => void;
}

export function PlotPointsSection({ imp, onUpdate }: PlotPointsSectionProps) {
  const hasPointCandidates = imp.paths.some((path) => !!path.pointTap);
  if (!hasPointCandidates) return null;

  const plotPointsEnabled = imp.plotPointsEnabled ?? false;

  return (
    <div className="mt-2 pt-2 border-t border-border-ui/30">
      <div className="flex items-center gap-2">
        <span
          id={`plot-points-label-${imp.id}`}
          className="text-[10px] text-content-muted uppercase tracking-wider flex-1"
        >
          Plot points
        </span>
        <button
          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors ${
            plotPointsEnabled ? "bg-accent" : "bg-secondary"
          }`}
          role="switch"
          aria-checked={plotPointsEnabled}
          aria-labelledby={`plot-points-label-${imp.id}`}
          onClick={() => onUpdate({ plotPointsEnabled: !plotPointsEnabled })}
        >
          <span
            className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform mt-0.5 ${
              plotPointsEnabled ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
