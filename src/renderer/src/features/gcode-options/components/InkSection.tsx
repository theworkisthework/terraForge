import type { GcodePrefs } from "../gcodePrefs";
import { CheckboxOption, NumberRow, OptionSection, SmallCheckbox } from "./optionControls";

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
  const disabled = !prefs.inkServiceEnabled;
  return (
    <OptionSection title="Ink" open={open} showHeader={showHeader} onToggleOpen={onToggleOpen}>
      <CheckboxOption
        label="Enable Paint/Ink dipping"
        checked={prefs.inkServiceEnabled}
        onChange={() => onTogglePref("inkServiceEnabled")}
        description="Insert brush dip and wash, or prime and wipe moves."
      />

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
            disabled={disabled}
            className="px-2 py-1 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="prime-wipe">Prime and wipe</option>
            <option value="brush-dip">Brush dip</option>
          </select>
        </div>

        <NumberRow
          label="Trigger every"
          inputLabel="Ink service trigger travel distance (mm)"
          value={prefs.inkServiceTriggerTravelMM}
          onChange={onSetInkServiceTriggerTravelMM}
          disabled={disabled}
          min="1"
          step="10"
          unit="mm travel"
        />
        <NumberRow
          label="Randomness"
          inputLabel="Ink service trigger randomness percent"
          value={prefs.inkServiceTriggerJitterPct}
          onChange={onSetInkServiceTriggerJitterPct}
          disabled={disabled}
          min="0"
          step="1"
          unit="%"
        />

        {prefs.inkServiceMode === "brush-dip" && (
          <>
            <SmallCheckbox
              label="Randomize dip station"
              checked={prefs.inkServiceRandomizeDipStation}
              onChange={() => onTogglePref("inkServiceRandomizeDipStation")}
              disabled={disabled}
            />
            <SmallCheckbox
              label="Include wash moves"
              checked={prefs.inkServiceIncludeWashMove}
              onChange={() => onTogglePref("inkServiceIncludeWashMove")}
              disabled={disabled}
            />
            {prefs.inkServiceIncludeWashMove && (
              <NumberRow
                label="Wash every"
                inputLabel="Wash every N dips"
                value={prefs.inkServiceWashEveryNDips}
                onChange={onSetInkServiceWashEveryNDips}
                disabled={disabled}
                min="1"
                step="1"
                unit="dips"
                width="w-20"
              />
            )}
            {layers.length > 0 && dipStations.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="text-xs text-content-muted">
                  Layer dip station mapping
                </div>
                {layers.map((layer) => (
                  <LayerDipRow
                    key={layer.id}
                    layer={layer}
                    stationId={prefs.inkServiceLayerDipMap[layer.id] ?? ""}
                    dipStations={dipStations}
                    disabled={disabled}
                    onChange={(stationId) => onSetInkServiceLayerDipStation(layer.id, stationId)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </OptionSection>
  );
}

/** One layer's dip tray: its name, colour, and a station choice ("Auto-select"
 * lets the generator pick). */
function LayerDipRow({
  layer,
  stationId,
  dipStations,
  disabled,
  onChange,
}: {
  layer: InkLayerOption;
  stationId: string;
  dipStations: Array<{ id: string; name: string }>;
  disabled: boolean;
  onChange: (stationId: string) => void;
}) {
  const displayName = `Layer ${layer.index}`;
  const normalizedDisplay = displayName.trim().toLowerCase();
  const rawSubtitle = layer.name && layer.name !== layer.id ? layer.name.trim() : undefined;
  const subtitle = rawSubtitle && rawSubtitle.toLowerCase() !== normalizedDisplay ? rawSubtitle : undefined;
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0">
        <div
          className="text-xs text-content-faint truncate"
          title={subtitle ? `${displayName} - ${subtitle}` : displayName}
        >
          {displayName}
          {subtitle ? ` - ${subtitle}` : ""}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <div
          className="w-3 h-3 rounded border border-content-faint"
          style={layer.colorCode ? { backgroundColor: layer.colorCode } : undefined}
          title={layer.colorCode ? `Layer color: ${layer.colorCode}` : "Layer color unavailable"}
        />
        <span className="text-[10px] text-content-faint font-mono min-w-[52px] text-right">
          {layer.colorCode ?? "n/a"}
        </span>
      </div>

      <select
        aria-label={`Dip station for layer ${displayName}`}
        value={stationId}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
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
}
