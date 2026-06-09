import type { InkServiceStation } from "../../../../../types";

interface InkServiceStationsOverlayProps {
  stations: InkServiceStation[];
  visible: boolean;
  getBedX: (mmX: number) => number;
  getBedY: (mmY: number) => number;
}

function stationColor(type: InkServiceStation["type"]): string {
  switch (type) {
    case "prime":
      return "#22c55e";
    case "wipe":
      return "#f59e0b";
    case "wash":
      return "#38bdf8";
    case "dip":
    default:
      return "#f97316";
  }
}

export function InkServiceStationsOverlay({
  stations,
  visible,
  getBedX,
  getBedY,
}: InkServiceStationsOverlayProps) {
  if (!visible) return null;
  const safeStations = Array.isArray(stations) ? stations : [];
  const activeStations = safeStations.filter(
    (station) => station.enabled !== false,
  );
  if (activeStations.length === 0) return null;

  return (
    <g aria-label="ink-service-stations">
      {activeStations.map((station) => {
        const x = getBedX(station.x);
        const y = getBedY(station.y);
        const color = stationColor(station.type);
        return (
          <g key={station.id} transform={`translate(${x}, ${y})`}>
            <circle
              r={4.5}
              fill={color}
              fillOpacity={0.85}
              stroke="#0b0f13"
              strokeWidth={1}
            />
            <circle
              r={9}
              fill="none"
              stroke={color}
              strokeOpacity={0.6}
              strokeWidth={1.2}
            />
            <text
              x={10}
              y={-8}
              fontSize={9}
              fill="#d1d5db"
              stroke="#111827"
              strokeWidth={0.8}
              paintOrder="stroke"
            >
              {station.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}
