// Portions of SVG icon data (rotate-ccw, rotate-cw, magnet, chevron-down, maximize-2, minimize-2, lock, unlock) and Lucide React icons (align-horizontal-justify-start/center/end, align-vertical-justify-start/center/end) from Lucide (https://lucide.dev)
// ISC License
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of
// Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
// Permission to use, copy, modify, and/or distribute this software for any purpose
// with or without fee is hereby granted, provided that the above copyright notice
// and this permission notice appear in all copies.
import { useState } from "react";
import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
} from "lucide-react";
import { useCanvasStore } from "../store/canvasStore";
import { useMachineStore } from "../store/machineStore";
import type { GcodeToolpath } from "../utils/gcodeParser";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function estimateDuration(tp: GcodeToolpath, fallbackFeedrate: number): string {
  const fr = tp.feedrate > 0 ? tp.feedrate : fallbackFeedrate;
  if (fr <= 0 || (tp.totalCutDistance === 0 && tp.totalRapidDistance === 0)) {
    return "—";
  }
  // Rapid moves run at approximately 5× the job feedrate, capped at 10 000 mm/min
  const rapidRate = Math.min(fr * 5, 10000);
  const totalSec = Math.round(
    (tp.totalCutDistance / fr + tp.totalRapidDistance / rapidRate) * 60,
  );
  return formatDuration(totalSec);
}

const ROT_STEPS = [1, 5, 15, 30, 45] as const;
type RotStep = (typeof ROT_STEPS)[number];
const ROT_PRESETS = [0, 45, 90, 135, 180, 225, 270, 315] as const;

export function PropertiesPanel() {
  const imports = useCanvasStore((s) => s.imports);
  const selectedImportId = useCanvasStore((s) => s.selectedImportId);
  const selectImport = useCanvasStore((s) => s.selectImport);
  const removeImport = useCanvasStore((s) => s.removeImport);
  const updateImport = useCanvasStore((s) => s.updateImport);
  const updatePath = useCanvasStore((s) => s.updatePath);
  const removePath = useCanvasStore((s) => s.removePath);
  const showCentreMarker = useCanvasStore((s) => s.showCentreMarker);
  const toggleCentreMarker = useCanvasStore((s) => s.toggleCentreMarker);
  const gcodeToolpath = useCanvasStore((s) => s.gcodeToolpath);
  const gcodeSource = useCanvasStore((s) => s.gcodeSource);
  const setGcodeToolpath = useCanvasStore((s) => s.setGcodeToolpath);
  const toolpathSelected = useCanvasStore((s) => s.toolpathSelected);
  const selectToolpath = useCanvasStore((s) => s.selectToolpath);
  const activeConfig = useMachineStore((s) => s.activeConfig);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingName, setEditingName] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [rotStep, setRotStep] = useState<RotStep>(45);
  const [stepFlyoutOpen, setStepFlyoutOpen] = useState(false);
  const [ratioLocked, setRatioLocked] = useState(true);

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
        {imports.length === 0 && !gcodeToolpath ? (
          <p className="text-xs text-gray-600 text-center py-6 px-3">
            No objects. Import an SVG.
          </p>
        ) : (
          <>
            {/* ── G-code toolpath entry ──────────────────────────────── */}
            {gcodeToolpath &&
              (() => {
                const cfg = activeConfig();
                const fallbackFeedrate = cfg?.feedrate ?? 300;
                const fileName = gcodeSource?.name ?? "G-code toolpath";
                const duration = estimateDuration(
                  gcodeToolpath,
                  fallbackFeedrate,
                );
                return (
                  <div className="border-b border-[#0f3460]/30">
                    {/* Header row */}
                    <div
                      className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-[#0f3460]/20 ${toolpathSelected ? "bg-[#0f3460]/20" : ""}`}
                      onClick={() => selectToolpath(!toolpathSelected)}
                    >
                      <button
                        className="text-gray-500 hover:text-gray-200 text-[10px] w-4 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectToolpath(!toolpathSelected);
                        }}
                      >
                        {toolpathSelected ? "▾" : "▸"}
                      </button>
                      {/* G-code file icon */}
                      <svg
                        className="shrink-0 text-[#0ea5e9]"
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <span
                        className="flex-1 min-w-0 text-[10px] truncate text-gray-300"
                        title={fileName}
                      >
                        {fileName}
                      </span>
                      <button
                        className="ml-1 text-gray-600 hover:text-[#e94560] shrink-0"
                        title="Clear toolpath"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGcodeToolpath(null);
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Expanded properties */}
                    {toolpathSelected && (
                      <div className="pl-6 pr-3 pb-2 pt-1 border-t border-[#0f3460]/20 space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-500">Size</span>
                          <span className="text-gray-300 font-mono">
                            {formatBytes(gcodeToolpath.fileSizeBytes)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-500">Lines</span>
                          <span className="text-gray-300 font-mono">
                            {gcodeToolpath.lineCount.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-500">Est. duration</span>
                          <span className="text-gray-300 font-mono">
                            {duration}
                          </span>
                        </div>
                        {gcodeToolpath.feedrate > 0 && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-gray-500">Feedrate</span>
                            <span className="text-gray-300 font-mono">
                              {Math.round(gcodeToolpath.feedrate)} mm/min
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* ── SVG import entries ─────────────────────────────────── */}
            {imports.map((imp) => {
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
                            {p.label ?? p.layer ?? `path ${p.id.slice(0, 6)}`}
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
                        const objW = imp.svgWidth * (imp.scaleX ?? imp.scale);
                        const objH = imp.svgHeight * (imp.scaleY ?? imp.scale);
                        const cfg = activeConfig();
                        const bedW = cfg?.bedWidth ?? 220;
                        const bedH = cfg?.bedHeight ?? 200;
                        return (
                          <>
                            {/* X / Y — two columns (unconstrained: G-code clips to bed) */}
                            <div className="grid grid-cols-2 gap-2 mb-0">
                              {numField(
                                "X (mm)",
                                imp.x,
                                (v) => updateImport(imp.id, { x: v }),
                                0.5,
                              )}
                              {numField(
                                "Y (mm)",
                                imp.y,
                                (v) => updateImport(imp.id, { y: v }),
                                0.5,
                              )}
                            </div>

                            {/* Alignment row — between position and size */}
                            {(() => {
                              const btnCls =
                                "p-1 text-gray-500 hover:text-gray-100 rounded hover:bg-[#0f3460]/40 transition-colors";
                              const alignH = (x: number) =>
                                updateImport(imp.id, {
                                  x: Math.round(x * 1000) / 1000,
                                });
                              const alignV = (y: number) =>
                                updateImport(imp.id, {
                                  y: Math.round(y * 1000) / 1000,
                                });
                              return (
                                <div className="flex items-center gap-0.5 mb-2">
                                  <button
                                    className={btnCls}
                                    title="Align left edge to bed left (X = 0)"
                                    onClick={() => alignH(0)}
                                  >
                                    <AlignHorizontalJustifyStart size={13} />
                                  </button>
                                  <button
                                    className={btnCls}
                                    title={`Centre horizontally (X = ${Math.round(((bedW - objW) / 2) * 10) / 10} mm)`}
                                    onClick={() => alignH((bedW - objW) / 2)}
                                  >
                                    <AlignHorizontalJustifyCenter size={13} />
                                  </button>
                                  <button
                                    className={btnCls}
                                    title={`Align right edge to bed right (X = ${Math.round((bedW - objW) * 10) / 10} mm)`}
                                    onClick={() => alignH(bedW - objW)}
                                  >
                                    <AlignHorizontalJustifyEnd size={13} />
                                  </button>
                                  <div className="w-px h-3 bg-[#0f3460] mx-0.5" />
                                  <button
                                    className={btnCls}
                                    title={`Align top edge to bed top (Y = ${Math.round((bedH - objH) * 10) / 10} mm)`}
                                    onClick={() => alignV(bedH - objH)}
                                  >
                                    <AlignVerticalJustifyStart size={13} />
                                  </button>
                                  <button
                                    className={btnCls}
                                    title={`Centre vertically (Y = ${Math.round(((bedH - objH) / 2) * 10) / 10} mm)`}
                                    onClick={() => alignV((bedH - objH) / 2)}
                                  >
                                    <AlignVerticalJustifyCenter size={13} />
                                  </button>
                                  <button
                                    className={btnCls}
                                    title="Align bottom edge to bed bottom (Y = 0)"
                                    onClick={() => alignV(0)}
                                  >
                                    <AlignVerticalJustifyEnd size={13} />
                                  </button>
                                </div>
                              );
                            })()}

                            {/* W / H — flex row with lock button between the two inputs */}
                            <div className="flex items-end gap-1 mb-0">
                              {/* W */}
                              <div className="flex-1 min-w-0 mb-2">
                                <label className="block text-[10px] text-gray-400 mb-0.5">
                                  W (mm)
                                </label>
                                <input
                                  type="number"
                                  value={Math.round(objW * 1000) / 1000}
                                  step={0.5}
                                  min={0.001}
                                  onChange={(e) => {
                                    const v = Math.max(0.001, +e.target.value);
                                    if (ratioLocked) {
                                      updateImport(imp.id, {
                                        scale: v / imp.svgWidth,
                                        scaleX: undefined,
                                        scaleY: undefined,
                                      });
                                    } else {
                                      updateImport(imp.id, {
                                        scaleX: v / imp.svgWidth,
                                      });
                                    }
                                  }}
                                  className="w-full bg-[#1a1a2e] border border-[#0f3460] rounded px-2 py-1 text-xs text-gray-200 focus:border-[#e94560] outline-none"
                                />
                              </div>
                              {/* Ratio lock button */}
                              <button
                                className={`mb-2 p-1.5 rounded transition-colors ${
                                  ratioLocked
                                    ? "text-[#e94560] hover:text-[#e94560] hover:bg-[#0f3460]/40"
                                    : "text-gray-600 hover:text-gray-300 hover:bg-[#0f3460]/40"
                                }`}
                                title={
                                  ratioLocked
                                    ? "Ratio locked — click to unlock"
                                    : "Ratio unlocked — click to lock"
                                }
                                onClick={() => {
                                  if (ratioLocked) {
                                    // Unlock: split into independent scaleX/scaleY (currently identical)
                                    setRatioLocked(false);
                                    updateImport(imp.id, {
                                      scaleX: imp.scaleX ?? imp.scale,
                                      scaleY: imp.scaleY ?? imp.scale,
                                    });
                                  } else {
                                    // Lock: snap back to uniform scale based on current W
                                    setRatioLocked(true);
                                    updateImport(imp.id, {
                                      scale: imp.scaleX ?? imp.scale,
                                      scaleX: undefined,
                                      scaleY: undefined,
                                    });
                                  }
                                }}
                              >
                                {ratioLocked ? (
                                  // Lucide lock icon
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect
                                      width="18"
                                      height="11"
                                      x="3"
                                      y="11"
                                      rx="2"
                                      ry="2"
                                    />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                  </svg>
                                ) : (
                                  // Lucide unlock icon
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect
                                      width="18"
                                      height="11"
                                      x="3"
                                      y="11"
                                      rx="2"
                                      ry="2"
                                    />
                                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                                  </svg>
                                )}
                              </button>
                              {/* H */}
                              <div className="flex-1 min-w-0 mb-2">
                                <label className="block text-[10px] text-gray-400 mb-0.5">
                                  H (mm)
                                </label>
                                <input
                                  type="number"
                                  value={Math.round(objH * 1000) / 1000}
                                  step={0.5}
                                  min={0.001}
                                  onChange={(e) => {
                                    const v = Math.max(0.001, +e.target.value);
                                    if (ratioLocked) {
                                      updateImport(imp.id, {
                                        scale: v / imp.svgHeight,
                                        scaleX: undefined,
                                        scaleY: undefined,
                                      });
                                    } else {
                                      updateImport(imp.id, {
                                        scaleY: v / imp.svgHeight,
                                      });
                                    }
                                  }}
                                  className="w-full bg-[#1a1a2e] border border-[#0f3460] rounded px-2 py-1 text-xs text-gray-200 focus:border-[#e94560] outline-none"
                                />
                              </div>
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
                            {/* Scale shortcut row: fit to bed | 1:1 reset */}
                            {(() => {
                              const fitScale = Math.min(
                                bedW / (imp.svgWidth || 1),
                                bedH / (imp.svgHeight || 1),
                              );
                              return (
                                <div className="flex items-center gap-0.5 mb-2 -mt-1">
                                  {/* Fit to bed */}
                                  <button
                                    className="p-1.5 text-gray-400 hover:text-gray-100 transition-colors rounded hover:bg-[#0f3460]/40"
                                    title={`Fit to bed (scale ${Math.round(fitScale * 1000) / 1000})`}
                                    onClick={() => {
                                      setRatioLocked(true);
                                      updateImport(imp.id, {
                                        scale: fitScale,
                                        scaleX: undefined,
                                        scaleY: undefined,
                                        x: 0,
                                        y: 0,
                                      });
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
                                      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                                      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                                      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                                      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                                    </svg>
                                  </button>
                                  {/* Reset to 1:1 */}
                                  <button
                                    className="p-1.5 text-gray-400 hover:text-gray-100 transition-colors rounded hover:bg-[#0f3460]/40"
                                    title="Reset scale to 1:1 (1 SVG unit = 1 mm)"
                                    onClick={() => {
                                      setRatioLocked(true);
                                      updateImport(imp.id, {
                                        scale: 1,
                                        scaleX: undefined,
                                        scaleY: undefined,
                                      });
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
                                      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                                      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                                      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                                      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            })()}
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

                              {/* Centre-of-rotation marker toggle */}
                              <button
                                className={`p-1.5 transition-colors rounded hover:bg-[#0f3460]/40 ${
                                  showCentreMarker
                                    ? "text-[#e94560] hover:text-[#e94560]"
                                    : "text-gray-600 hover:text-gray-300"
                                }`}
                                title={
                                  showCentreMarker
                                    ? "Hide centre marker"
                                    : "Show centre marker"
                                }
                                onClick={toggleCentreMarker}
                              >
                                {/* Lucide crosshair icon */}
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
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="22" y1="12" x2="18" y2="12" />
                                  <line x1="6" y1="12" x2="2" y2="12" />
                                  <line x1="12" y1="6" x2="12" y2="2" />
                                  <line x1="12" y1="22" x2="12" y2="18" />
                                </svg>
                              </button>

                              {/* Magnet — cycles through angle presets */}
                              <button
                                className="p-1.5 text-gray-400 hover:text-[#e94560] transition-colors rounded hover:bg-[#0f3460]/40"
                                title={`Snap to next preset (${ROT_PRESETS.join("° · ")}°)`}
                                onClick={() => {
                                  const norm =
                                    ((imp.rotation % 360) + 360) % 360;
                                  const idx = ROT_PRESETS.findIndex(
                                    (p) => Math.abs(p - norm) < 1,
                                  );
                                  const next =
                                    ROT_PRESETS[
                                      idx < 0
                                        ? 0
                                        : (idx + 1) % ROT_PRESETS.length
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

                            {/* ── Hatch fill ─────────────────────────────── */}
                            {(() => {
                              const applyHatch =
                                useCanvasStore.getState().applyHatch;
                              const hasFilled = imp.paths.some(
                                (p) => p.hasFill,
                              );
                              if (!hasFilled) return null;
                              return (
                                <div className="mt-2 pt-2 border-t border-[#0f3460]/30">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider flex-1">
                                      Hatch fill
                                    </span>
                                    <button
                                      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors ${
                                        imp.hatchEnabled
                                          ? "bg-[#e94560]"
                                          : "bg-[#0f3460]"
                                      }`}
                                      role="switch"
                                      aria-checked={imp.hatchEnabled}
                                      onClick={() =>
                                        applyHatch(
                                          imp.id,
                                          imp.hatchSpacingMM,
                                          imp.hatchAngleDeg,
                                          !imp.hatchEnabled,
                                        )
                                      }
                                    >
                                      <span
                                        className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform mt-0.5 ${
                                          imp.hatchEnabled
                                            ? "translate-x-3.5"
                                            : "translate-x-0.5"
                                        }`}
                                      />
                                    </button>
                                  </div>
                                  {imp.hatchEnabled && (
                                    <div>
                                      {numField(
                                        "Spacing (mm)",
                                        imp.hatchSpacingMM,
                                        (v) =>
                                          applyHatch(
                                            imp.id,
                                            Math.max(0.1, v),
                                            imp.hatchAngleDeg,
                                            true,
                                          ),
                                        0.1,
                                        0.1,
                                      )}
                                      {numField(
                                        "Angle (°)",
                                        imp.hatchAngleDeg,
                                        (v) =>
                                          applyHatch(
                                            imp.id,
                                            imp.hatchSpacingMM,
                                            ((v % 180) + 180) % 180,
                                            true,
                                          ),
                                        5,
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
