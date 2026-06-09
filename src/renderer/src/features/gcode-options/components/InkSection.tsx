import { ChevronDown } from "lucide-react";
import type { GcodePrefs } from "../gcodePrefs";

export interface InkLayerOption {
  id: string;
  index: number;
  name?: string;
  colorCode?: string;
}

interface InkSectionProps {
  open: boolean;
  showHeader?: boolean;
  prefs: GcodePrefs;
  layers: InkLayerOption[];
  dipStations: Array<{ id: string; name: string }>;
  onToggleOpen: () => void;
  onTogglePref: (key: keyof GcodePrefs) => void;
  onSetInkServiceMode: (mode: GcodePrefs["inkServiceMode"]) => void;
  onSetInkServiceTriggerTravelMM: (value: string) => void;
  onSetInkServiceTriggerJitterPct: (value: string) => void;
  onSetInkServiceWashEveryNDips: (value: string) => void;
  onSetInkServiceLayerDipStation: (layerId: string, stationId: string) => void;
}

export function InkSection({
  open,
  showHeader = true,
  prefs,
  layers,
  dipStations,
  onToggleOpen,
  onTogglePref,
  onSetInkServiceMode,
  onSetInkServiceTriggerTravelMM,
  onSetInkServiceTriggerJitterPct,
  onSetInkServiceWashEveryNDips,
  onSetInkServiceLayerDipStation,
}: InkSectionProps) {
  const content = (
    <div className="flex flex-col gap-4 mt-2 mb-1">
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          aria-label="Enable Paint/Ink dipping"
          className="mt-0.5 accent-accent cursor-pointer"
          checked={prefs.inkServiceEnabled}
          onChange={() => onTogglePref("inkServiceEnabled")}
        />
        <div>
          <div className="text-sm text-content font-medium">
            Enable Paint/Ink dipping
          </div>
          <div className="text-xs text-content-muted mt-0.5">
            Insert brush dip and wash, or prime and wipe moves.
          </div>
        </div>
      </label>

      <div className="grid grid-cols-1 gap-2 pl-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-content-muted whitespace-nowrap">
            Mode
          </span>
          <select
            aria-label="Ink service mode"
            value={prefs.inkServiceMode}
            onChange={(e) =>
              onSetInkServiceMode(
                e.target.value as GcodePrefs["inkServiceMode"],
              )
            }
            disabled={!prefs.inkServiceEnabled}
            className="px-2 py-1 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="prime-wipe">Prime and wipe</option>
            <option value="brush-dip">Brush dip</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-content-muted whitespace-nowrap">
            Trigger every
          </span>
          <input
            type="number"
            min="1"
            step="10"
            value={prefs.inkServiceTriggerTravelMM}
            onChange={(e) => onSetInkServiceTriggerTravelMM(e.target.value)}
            disabled={!prefs.inkServiceEnabled}
            aria-label="Ink service trigger travel distance (mm)"
            className="w-24 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <span className="text-xs text-content-muted">mm travel</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-content-muted whitespace-nowrap">
            Randomness
          </span>
          <input
            type="number"
            min="0"
            step="1"
            value={prefs.inkServiceTriggerJitterPct}
            onChange={(e) => onSetInkServiceTriggerJitterPct(e.target.value)}
            disabled={!prefs.inkServiceEnabled}
            aria-label="Ink service trigger randomness percent"
            className="w-24 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <span className="text-xs text-content-muted">%</span>
        </div>

        {prefs.inkServiceMode === "brush-dip" && (
          <>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label="Randomize dip station"
                className="accent-accent cursor-pointer"
                checked={prefs.inkServiceRandomizeDipStation}
                onChange={() => onTogglePref("inkServiceRandomizeDipStation")}
                disabled={!prefs.inkServiceEnabled}
              />
              <span className="text-xs text-content">
                Randomize dip station
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label="Include wash moves"
                className="accent-accent cursor-pointer"
                checked={prefs.inkServiceIncludeWashMove}
                onChange={() => onTogglePref("inkServiceIncludeWashMove")}
                disabled={!prefs.inkServiceEnabled}
              />
              <span className="text-xs text-content">Include wash moves</span>
            </label>

            {prefs.inkServiceIncludeWashMove && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-content-muted whitespace-nowrap">
                  Wash every
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={prefs.inkServiceWashEveryNDips}
                  onChange={(e) =>
                    onSetInkServiceWashEveryNDips(e.target.value)
                  }
                  disabled={!prefs.inkServiceEnabled}
                  aria-label="Wash every N dips"
                  className="w-20 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="text-xs text-content-muted">dips</span>
              </div>
            )}

            {layers.length > 0 && dipStations.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="text-xs text-content-muted">
                  Layer dip station mapping
                </div>
                {layers.map((layer) => {
                  const displayName = `Layer ${layer.index}`;
                  const normalizedDisplay = displayName.trim().toLowerCase();
                  const rawSubtitle =
                    layer.name && layer.name !== layer.id
                      ? layer.name.trim()
                      : undefined;
                  const subtitle =
                    rawSubtitle &&
                    rawSubtitle.toLowerCase() !== normalizedDisplay
                      ? rawSubtitle
                      : undefined;
                  return (
                    <div key={layer.id} className="flex items-center gap-2">
                      <div className="min-w-0">
                        <div
                          className="text-xs text-content-faint truncate"
                          title={
                            subtitle
                              ? `${displayName} - ${subtitle}`
                              : displayName
                          }
                        >
                          {displayName}
                          {subtitle ? ` - ${subtitle}` : ""}
                        </div>
                      </div>

                      <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        <div
                          className="w-3 h-3 rounded border border-content-faint"
                          style={
                            layer.colorCode
                              ? { backgroundColor: layer.colorCode }
                              : undefined
                          }
                          title={
                            layer.colorCode
                              ? `Layer color: ${layer.colorCode}`
                              : "Layer color unavailable"
                          }
                        />
                        <span className="text-[10px] text-content-faint font-mono min-w-[52px] text-right">
                          {layer.colorCode ?? "n/a"}
                        </span>
                      </div>

                      <select
                        aria-label={`Dip station for layer ${displayName}`}
                        value={prefs.inkServiceLayerDipMap[layer.id] ?? ""}
                        onChange={(e) =>
                          onSetInkServiceLayerDipStation(
                            layer.id,
                            e.target.value,
                          )
                        }
                        disabled={!prefs.inkServiceEnabled}
                        className="px-2 py-1 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">Auto-select</option>
                        {dipStations.map((station) => (
                          <option key={station.id} value={station.id}>
                            {station.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (!showHeader) return <div>{content}</div>;

  return (
    <div>
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex items-center gap-1.5 text-xs font-semibold text-content-faint hover:text-content uppercase tracking-wider transition-colors select-none w-full text-left py-1"
      >
        <ChevronDown
          size={13}
          className={`transition-transform duration-150 flex-shrink-0 ${open ? "rotate-0" : "-rotate-90"}`}
        />
        Ink
      </button>
      {open && content}
    </div>
  );
}
