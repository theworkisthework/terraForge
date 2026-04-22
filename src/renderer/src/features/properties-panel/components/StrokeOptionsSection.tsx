import type { SvgImport } from "../../../../types";

interface StrokeOptionsSectionProps {
  imp: SvgImport;
  onUpdate: (changes: Partial<SvgImport>) => void;
}

export function StrokeOptionsSection({
  imp,
  onUpdate,
}: StrokeOptionsSectionProps) {
  const strokeEnabled = imp.strokeEnabled ?? true;
  const hasNoSourceStrokePaths = imp.paths.some(
    (path) => !(path.sourceOutlineVisible ?? path.outlineVisible !== false),
  );
  const generatedStrokeForNoStroke = imp.generatedStrokeForNoStroke ?? false;

  return (
    <div className="mt-2 pt-2 border-t border-border-ui/30">
      <div className="flex items-center gap-2 mb-2">
        <span
          id={`stroke-label-${imp.id}`}
          className="text-[10px] text-content-muted uppercase tracking-wider flex-1"
        >
          Stroke outlines
        </span>
        <button
          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors ${
            strokeEnabled ? "bg-accent" : "bg-secondary"
          }`}
          role="switch"
          aria-checked={strokeEnabled}
          aria-labelledby={`stroke-label-${imp.id}`}
          onClick={() => onUpdate({ strokeEnabled: !strokeEnabled })}
        >
          <span
            className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform mt-0.5 ${
              strokeEnabled ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {hasNoSourceStrokePaths && (
        <div className="flex items-center gap-2">
          <span
            id={`gen-stroke-label-${imp.id}`}
            className="text-[10px] text-content-muted uppercase tracking-wider flex-1"
          >
            Generate stroke for no-stroke paths
          </span>
          <button
            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors ${
              generatedStrokeForNoStroke ? "bg-accent" : "bg-secondary"
            }`}
            role="switch"
            aria-checked={generatedStrokeForNoStroke}
            aria-labelledby={`gen-stroke-label-${imp.id}`}
            onClick={() =>
              onUpdate({
                generatedStrokeForNoStroke: !generatedStrokeForNoStroke,
              })
            }
          >
            <span
              className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform mt-0.5 ${
                generatedStrokeForNoStroke
                  ? "translate-x-3.5"
                  : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      )}
    </div>
  );
}
