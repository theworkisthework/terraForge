import type { GcodePrefs } from "../gcodePrefs";
import { Badge } from "../../../components/Badge";

interface VinylSectionProps {
  prefs: GcodePrefs;
  onTogglePref: (key: keyof GcodePrefs) => void;
  onSetVinylWeedBorderMargin: (value: string) => void;
}

export function VinylSection({
  prefs,
  onTogglePref,
  onSetVinylWeedBorderMargin,
}: VinylSectionProps) {
  return (
    <div className="flex flex-col gap-4 mt-2 mb-1">
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          aria-label="Generate drag-knife/vinyl-cutter G-code"
          className="mt-0.5 accent-accent cursor-pointer"
          checked={prefs.generateVinylCuttingGcode}
          onChange={() => onTogglePref("generateVinylCuttingGcode")}
        />
        <div>
          <div className="text-sm text-content font-medium flex items-center gap-2 flex-wrap">
            Generate drag-knife/vinyl-cutter G-code
            <Badge variant="warning">Experimental</Badge>
          </div>
          <div className="text-xs text-content-muted mt-0.5">
            Applies drag-knife blade-offset corner compensation using the
            application vinyl cutting settings.
          </div>
        </div>
      </label>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          aria-label="Generate weed border G-code"
          className="mt-0.5 accent-accent cursor-pointer"
          checked={prefs.generateVinylWeedBorderGcode}
          onChange={() => onTogglePref("generateVinylWeedBorderGcode")}
        />
        <div>
          <div className="text-sm text-content font-medium flex items-center gap-2 flex-wrap">
            Generate weed border G-code
            <Badge variant="warning">Experimental</Badge>
          </div>
          <div className="text-xs text-content-muted mt-0.5">
            Adds a rectangular border around the final job bounds to make
            weeding easier.
          </div>
        </div>
      </label>

      {prefs.generateVinylWeedBorderGcode && (
        <div className="flex items-center gap-2 pl-6">
          <span className="text-xs text-content-muted whitespace-nowrap">
            Weed border margin
          </span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={prefs.vinylWeedBorderMarginMM}
            onChange={(e) => onSetVinylWeedBorderMargin(e.target.value)}
            aria-label="Weed border margin (mm)"
            className="w-24 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent"
          />
          <span className="text-xs text-content-muted">mm</span>
        </div>
      )}
    </div>
  );
}
