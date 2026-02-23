import { useCanvasStore } from "../store/canvasStore";
import type { VectorObject } from "../../../types";

export function PropertiesPanel() {
  const selectedObject = useCanvasStore((s) => s.selectedObject);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const removeObject = useCanvasStore((s) => s.removeObject);
  const objects = useCanvasStore((s) => s.objects);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selectObject = useCanvasStore((s) => s.selectObject);

  const obj = selectedObject();

  const set = (patch: Partial<VectorObject>) => {
    if (obj) updateObject(obj.id, patch);
  };

  const field = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    step = 1,
    min?: number,
  ) => (
    <div className="mb-3">
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full bg-[#1a1a2e] border border-[#0f3460] rounded px-2 py-1 text-sm text-gray-200 focus:border-[#e94560] outline-none"
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#0f3460]">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Properties
        </span>
      </div>

      {/* Object list */}
      <div className="border-b border-[#0f3460] max-h-32 overflow-y-auto">
        {objects.length === 0 && (
          <p className="text-xs text-gray-600 text-center py-4 px-3">
            No objects. Import an SVG.
          </p>
        )}
        {objects.map((o) => (
          <div
            key={o.id}
            onClick={() => selectObject(o.id)}
            className={`flex items-center px-3 py-1.5 cursor-pointer text-xs border-b border-[#0f3460]/30 ${selectedId === o.id ? "bg-[#0f3460] text-white" : "hover:bg-[#0f3460]/40 text-gray-300"}`}
          >
            <span
              onClick={(e) => {
                e.stopPropagation();
                updateObject(o.id, { visible: !o.visible });
              }}
              className="mr-2 text-gray-500 hover:text-gray-200"
              title="Toggle visibility"
            >
              {o.visible ? "👁" : "○"}
            </span>
            <span className="flex-1 truncate">
              {o.layer ?? `Object ${o.id.slice(0, 6)}`}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeObject(o.id);
              }}
              className="text-gray-600 hover:text-[#e94560] ml-1"
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Selected object fields */}
      {obj ? (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs text-gray-500 mb-3 truncate" title={obj.id}>
            ID: {obj.id.slice(0, 12)}…
          </p>

          {field("X position (mm)", obj.x, (v) => set({ x: v }), 0.1, 0)}
          {field("Y position (mm)", obj.y, (v) => set({ y: v }), 0.1, 0)}
          {field(
            "Scale",
            obj.scale,
            (v) => set({ scale: Math.max(0.001, v) }),
            0.05,
            0.001,
          )}
          {field("Rotation (°)", obj.rotation, (v) => set({ rotation: v }), 1)}

          <div className="mt-4 text-xs text-gray-500">
            <div>
              Original: {obj.originalWidth.toFixed(1)} ×{" "}
              {obj.originalHeight.toFixed(1)} units
            </div>
            <div>
              Scaled: {(obj.originalWidth * obj.scale).toFixed(1)} ×{" "}
              {(obj.originalHeight * obj.scale).toFixed(1)} mm
            </div>
          </div>

          <button
            onClick={() => removeObject(obj.id)}
            className="mt-4 w-full text-xs py-1.5 rounded bg-[#3a1a1a] hover:bg-[#6a2020] transition-colors text-red-300"
          >
            Remove object
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-600 p-4 text-center">
          Select an object on the canvas to edit its properties.
        </div>
      )}
    </div>
  );
}
