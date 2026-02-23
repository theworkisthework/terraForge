import { useState } from "react";
import { useCanvasStore } from "../store/canvasStore";

export function PropertiesPanel() {
  const imports        = useCanvasStore((s) => s.imports);
  const selectedImportId = useCanvasStore((s) => s.selectedImportId);
  const selectImport   = useCanvasStore((s) => s.selectImport);
  const removeImport   = useCanvasStore((s) => s.removeImport);
  const updateImport   = useCanvasStore((s) => s.updateImport);
  const updatePath     = useCanvasStore((s) => s.updatePath);
  const removePath     = useCanvasStore((s) => s.removePath);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingName, setEditingName] = useState<{ id: string; value: string } | null>(null);

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const numField = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    step = 1,
    min?: number,
  ) => (
    <div className="mb-2">
      <label className="block text-[10px] text-gray-400 mb-0.5">{label}</label>
      <input
        type="number"
        value={Math.round(value * 1000) / 1000}
        step={step}
        min={min}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full bg-[#1a1a2e] border border-[#0f3460] rounded px-2 py-1 text-xs text-gray-200 focus:border-[#e94560] outline-none"
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#0f3460] shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Properties
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {imports.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-6 px-3">
            No objects. Import an SVG.
          </p>
        ) : (
          imports.map((imp) => {
            const isSelected = imp.id === selectedImportId;
            const isExpanded = expandedIds.has(imp.id);

            return (
              <div
                key={imp.id}
                className={`border-b border-[#0f3460]/30 ${isSelected ? "bg-[#0f3460]/20" : ""}`}
              >
                {/* Import header row */}
                <div
                  className="flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-[#0f3460]/20"
                  onClick={() => selectImport(isSelected ? null : imp.id)}
                >
                  {/* Expand toggle */}
                  <button
                    className="text-gray-500 hover:text-gray-200 text-[10px] w-4 shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleExpand(imp.id); }}
                  >
                    {isExpanded ? "▾" : "▸"}
                  </button>

                  {/* Visibility */}
                  <span
                    className="text-gray-500 hover:text-gray-200 text-[10px] cursor-pointer shrink-0"
                    title="Toggle visibility"
                    onClick={(e) => { e.stopPropagation(); updateImport(imp.id, { visible: !imp.visible }); }}
                  >
                    {imp.visible ? "👁" : "○"}
                  </span>

                  {/* Editable name */}
                  {editingName?.id === imp.id ? (
                    <input
                      autoFocus
                      value={editingName.value}
                      className="flex-1 min-w-0 bg-[#1a1a2e] border border-[#e94560] rounded px-1 text-[10px] outline-none"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingName({ id: imp.id, value: e.target.value })}
                      onBlur={() => {
                        updateImport(imp.id, { name: editingName!.value });
                        setEditingName(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { updateImport(imp.id, { name: editingName!.value }); setEditingName(null); }
                        if (e.key === "Escape") setEditingName(null);
                      }}
                    />
                  ) : (
                    <span
                      className="flex-1 min-w-0 text-[10px] truncate text-gray-300"
                      title="Double-click to rename"
                      onDoubleClick={(e) => { e.stopPropagation(); setEditingName({ id: imp.id, value: imp.name }); }}
                    >
                      {imp.name}
                    </span>
                  )}

                  <span className="text-[9px] text-gray-600 shrink-0 ml-1">
                    {imp.paths.length}p
                  </span>
                  <button
                    className="ml-1 text-gray-600 hover:text-[#e94560] shrink-0"
                    title="Delete import"
                    onClick={(e) => { e.stopPropagation(); removeImport(imp.id); }}
                  >
                    ✕
                  </button>
                </div>

                {/* Expanded path list */}
                {isExpanded && (
                  <div className="pl-6 pb-1 border-t border-[#0f3460]/20">
                    {imp.paths.map((p) => (
                      <div key={p.id} className="flex items-center gap-1 py-0.5 text-[9px]">
                        <span
                          className="text-gray-500 hover:text-gray-200 cursor-pointer"
                          onClick={() => updatePath(imp.id, p.id, { visible: !p.visible })}
                          title="Toggle path visibility"
                        >
                          {p.visible ? "👁" : "○"}
                        </span>
                        <span className="flex-1 min-w-0 text-gray-500 truncate">
                          {p.layer ?? `path ${p.id.slice(0, 6)}`}
                        </span>
                        <button
                          className="text-gray-600 hover:text-[#e94560]"
                          title="Remove path"
                          onClick={() => removePath(imp.id, p.id)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Properties form — shown when import is selected */}
                {isSelected && (
                  <div className="px-3 pb-3 pt-2 border-t border-[#0f3460]/30">
                    {numField("X (mm)", imp.x, (v) => updateImport(imp.id, { x: Math.max(0, v) }), 0.5, 0)}
                    {numField("Y (mm)", imp.y, (v) => updateImport(imp.id, { y: Math.max(0, v) }), 0.5, 0)}
                    {numField("Scale", imp.scale, (v) => updateImport(imp.id, { scale: Math.max(0.001, v) }), 0.05, 0.001)}
                    <div className="text-[9px] text-gray-600 mt-1">
                      {(imp.svgWidth * imp.scale).toFixed(1)} × {(imp.svgHeight * imp.scale).toFixed(1)} mm
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
