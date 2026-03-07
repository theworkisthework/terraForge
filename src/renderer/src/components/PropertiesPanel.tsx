// Portions of SVG icon data (rotate-ccw, rotate-cw, magnet, chevron-down) from Lucide (https://lucide.dev)
// ISC License
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of
// Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
// Permission to use, copy, modify, and/or distribute this software for any purpose
// with or without fee is hereby granted, provided that the above copyright notice
// and this permission notice appear in all copies.
import { useState } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { useMachineStore } from "../store/machineStore";

const ROT_STEPS = [15, 45, 90] as const;
type RotStep = (typeof ROT_STEPS)[number];
const ROT_PRESETS = [0, 45, 90, 135, 180] as const;

export function PropertiesPanel() {
  const imports = useCanvasStore((s) => s.imports);
  const selectedImportId = useCanvasStore((s) => s.selectedImportId);
  const selectImport = useCanvasStore((s) => s.selectImport);
  const removeImport = useCanvasStore((s) => s.removeImport);
  const updateImport = useCanvasStore((s) => s.updateImport);
  const updatePath = useCanvasStore((s) => s.updatePath);
  const removePath = useCanvasStore((s) => s.removePath);
  const activeConfig = useMachineStore((s) => s.activeConfig);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingName, setEditingName] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [rotStep, setRotStep] = useState<RotStep>(45);
  const [stepFlyoutOpen, setStepFlyoutOpen] = useState(false);

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
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(imp.id);
                    }}
                  >
                    {isExpanded ? "▾" : "▸"}
                  </button>

                  {/* Visibility */}
                  <span
                    className="text-gray-500 hover:text-gray-200 text-[10px] cursor-pointer shrink-0"
                    title="Toggle visibility"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateImport(imp.id, { visible: !imp.visible });
                    }}
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
                      onChange={(e) =>
                        setEditingName({ id: imp.id, value: e.target.value })
                      }
                      onBlur={() => {
                        updateImport(imp.id, { name: editingName!.value });
                        setEditingName(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          updateImport(imp.id, { name: editingName!.value });
                          setEditingName(null);
                        }
                        if (e.key === "Escape") setEditingName(null);
                      }}
                    />
                  ) : (
                    <span
                      className="flex-1 min-w-0 text-[10px] truncate text-gray-300"
                      title="Double-click to rename"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingName({ id: imp.id, value: imp.name });
                      }}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImport(imp.id);
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Expanded path list */}
                {isExpanded && (
                  <div className="pl-6 pb-1 border-t border-[#0f3460]/20">
                    {imp.paths.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-1 py-0.5 text-[9px]"
                      >
                        <span
                          className="text-gray-500 hover:text-gray-200 cursor-pointer"
                          onClick={() =>
                            updatePath(imp.id, p.id, { visible: !p.visible })
                          }
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
                    {(() => {
                      const cfg = activeConfig();
                      const bedW = cfg?.bedWidth ?? Infinity;
                      const bedH = cfg?.bedHeight ?? Infinity;
                      const objW = imp.svgWidth * imp.scale;
                      const objH = imp.svgHeight * imp.scale;
                      const maxX = Math.max(0, bedW - objW);
                      const maxY = Math.max(0, bedH - objH);
                      // Max W/H = remaining bed space from the object's current origin
                      const maxW = Math.max(0.001, bedW - imp.x);
                      const maxH = Math.max(0.001, bedH - imp.y);
                      return (
                        <>
                          {/* X / Y — two columns */}
                          <div className="grid grid-cols-2 gap-2 mb-0">
                            {numField(
                              "X (mm)",
                              imp.x,
                              (v) =>
                                updateImport(imp.id, {
                                  x: Math.max(0, Math.min(v, maxX)),
                                }),
                              0.5,
                              0,
                            )}
                            {numField(
                              "Y (mm)",
                              imp.y,
                              (v) =>
                                updateImport(imp.id, {
                                  y: Math.max(0, Math.min(v, maxY)),
                                }),
                              0.5,
                              0,
                            )}
                          </div>
                          {/* W / H — two columns, linked to scale */}
                          <div className="grid grid-cols-2 gap-2 mb-0">
                            {numField(
                              "W (mm)",
                              objW,
                              (v) => {
                                const clamped = Math.max(
                                  0.001,
                                  Math.min(v, maxW),
                                );
                                updateImport(imp.id, {
                                  scale: clamped / imp.svgWidth,
                                });
                              },
                              0.5,
                              0.001,
                            )}
                            {numField(
                              "H (mm)",
                              objH,
                              (v) => {
                                const clamped = Math.max(
                                  0.001,
                                  Math.min(v, maxH),
                                );
                                updateImport(imp.id, {
                                  scale: clamped / imp.svgHeight,
                                });
                              },
                              0.5,
                              0.001,
                            )}
                          </div>
                          {/* Scale — full width */}
                          {numField(
                            "Scale",
                            imp.scale,
                            (v) =>
                              updateImport(imp.id, {
                                scale: Math.max(0.001, v),
                              }),
                            0.05,
                            0.001,
                          )}
                          {/* Rotation — full width */}
                          {numField(
                            "Rotation (°)",
                            imp.rotation,
                            (v) => updateImport(imp.id, { rotation: v }),
                            1,
                          )}
                          {/* Rotation shortcut row: CCW | CW | step flyout | magnet cycle */}
                          <div className="flex items-center gap-0.5 mb-2">
                            {/* CCW — borderless icon button */}
                            <button
                              className="p-1.5 text-gray-400 hover:text-gray-100 transition-colors rounded hover:bg-[#0f3460]/40"
                              title={`Rotate ${rotStep}° counter-clockwise`}
                              onClick={() =>
                                updateImport(imp.id, {
                                  rotation: imp.rotation - rotStep,
                                })
                              }
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                              </svg>
                            </button>

                            {/* CW — borderless icon button */}
                            <button
                              className="p-1.5 text-gray-400 hover:text-gray-100 transition-colors rounded hover:bg-[#0f3460]/40"
                              title={`Rotate ${rotStep}° clockwise`}
                              onClick={() =>
                                updateImport(imp.id, {
                                  rotation: imp.rotation + rotStep,
                                })
                              }
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                                <path d="M21 3v5h-5" />
                              </svg>
                            </button>

                            {/* Step flyout trigger */}
                            <div className="relative">
                              <button
                                className="flex items-center gap-0.5 px-1.5 py-1 text-[10px] text-gray-400 hover:text-gray-100 rounded hover:bg-[#0f3460]/40 transition-colors"
                                title="Change rotation step"
                                onClick={() => setStepFlyoutOpen((o) => !o)}
                              >
                                {rotStep}°
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="m6 9 6 6 6-6" />
                                </svg>
                              </button>
                              {stepFlyoutOpen && (
                                <>
                                  {/* Invisible backdrop to close on outside click */}
                                  <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setStepFlyoutOpen(false)}
                                  />
                                  <div className="absolute bottom-full left-0 mb-1 bg-[#16213e] border border-[#0f3460] rounded shadow-xl z-20 py-0.5 min-w-[4rem]">
                                    {ROT_STEPS.map((s) => (
                                      <button
                                        key={s}
                                        className={`block w-full text-left px-3 py-1 text-[10px] transition-colors ${
                                          rotStep === s
                                            ? "text-gray-100 bg-[#0f3460]"
                                            : "text-gray-400 hover:text-gray-100 hover:bg-[#0f3460]/50"
                                        }`}
                                        onClick={() => {
                                          setRotStep(s);
                                          setStepFlyoutOpen(false);
                                        }}
                                      >
                                        {s}°
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>

                            <span className="flex-1" />

                            {/* Magnet — cycles through angle presets */}
                            <button
                              className="p-1.5 text-gray-400 hover:text-[#e94560] transition-colors rounded hover:bg-[#0f3460]/40"
                              title={`Snap to next preset (${ROT_PRESETS.join("° · ")}°)`}
                              onClick={() => {
                                const norm = ((imp.rotation % 360) + 360) % 360;
                                const idx = ROT_PRESETS.findIndex(
                                  (p) => Math.abs(p - norm) < 1,
                                );
                                const next =
                                  ROT_PRESETS[
                                    idx < 0 ? 0 : (idx + 1) % ROT_PRESETS.length
                                  ];
                                updateImport(imp.id, { rotation: next });
                              }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3Z" />
                                <path d="m5 8 4 4" />
                                <path d="m12 15 4 4" />
                              </svg>
                            </button>
                          </div>
                        </>
                      );
                    })()}
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
