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
import { DEFAULT_STROKE_WIDTH_MM } from "../../../types";

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
  const layerGroups = useCanvasStore((s) => s.layerGroups);
  const addLayerGroup = useCanvasStore((s) => s.addLayerGroup);
  const removeLayerGroup = useCanvasStore((s) => s.removeLayerGroup);
  const updateLayerGroup = useCanvasStore((s) => s.updateLayerGroup);
  const assignImportToGroup = useCanvasStore((s) => s.assignImportToGroup);
  const selectedGroupId = useCanvasStore((s) => s.selectedGroupId);
  const selectGroup = useCanvasStore((s) => s.selectGroup);
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const machineStatus = useMachineStore((s) => s.status);
  const isJobActive =
    machineStatus?.state === "Run" || machineStatus?.state === "Hold";

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingName, setEditingName] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [editingGroupName, setEditingGroupName] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [draggingImportId, setDraggingImportId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    new Set(),
  );
  const [rotStep, setRotStep] = useState<RotStep>(45);

  const toggleGroupCollapse = (id: string) =>
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const [stepFlyoutOpen, setStepFlyoutOpen] = useState(false);
  const [ratioLocked, setRatioLocked] = useState(true);

  /** Returns the group id that the given import belongs to, or null. */
  const importGroupId = (importId: string): string | null =>
    layerGroups.find((g) => g.importIds.includes(importId))?.id ?? null;

  /**
   * Set strokeWidthMM on all imports that share the same "pen group" as the
   * changed import.  If it belongs to a LayerGroup, all members get the same
   * value.  If it is ungrouped, all other ungrouped imports are synced too.
   */
  const syncStrokeWidth = (changedId: string, widthMM: number) => {
    const groupId = importGroupId(changedId);
    const siblings = groupId
      ? (layerGroups.find((g) => g.id === groupId)?.importIds ?? [])
      : imports
          .filter((imp) => importGroupId(imp.id) === null)
          .map((imp) => imp.id);
    for (const id of siblings) {
      updateImport(id, { strokeWidthMM: widthMM });
    }
  };

  const GROUP_COLORS = [
    "#e94560",
    "#0ea5e9",
    "#22c55e",
    "#f59e0b",
    "#a855f7",
    "#ec4899",
    "#14b8a6",
    "#f97316",
  ];

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
  ) => {
    const inputId = `numfield-${label
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()}`;
    return (
      <div className="mb-2">
        <label
          htmlFor={inputId}
          className="block text-[10px] text-content-muted mb-0.5"
        >
          {label}
        </label>
        <input
          id={inputId}
          type="number"
          value={Math.round(value * 1000) / 1000}
          step={step}
          min={min}
          onChange={(e) => onChange(+e.target.value)}
          className="w-full bg-app border border-border-ui rounded px-2 py-1 text-xs text-content focus:border-accent outline-none"
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border-ui shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-content-muted">
          Properties
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {imports.length === 0 && !gcodeToolpath ? (
          <p className="text-xs text-content-faint text-center py-6 px-3">
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
                  <div className="border-b border-border-ui/30">
                    {/* Header row */}
                    <div
                      className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-secondary/20 ${toolpathSelected ? "bg-secondary/20" : ""}`}
                      onClick={() => selectToolpath(!toolpathSelected)}
                    >
                      <button
                        aria-expanded={toolpathSelected}
                        aria-label={toolpathSelected ? "Collapse toolpath details" : "Expand toolpath details"}
                        className="text-content-faint hover:text-content text-[10px] w-4 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectToolpath(!toolpathSelected);
                        }}
                      >
                        {toolpathSelected ? "▾" : "▸"}
                      </button>
                      {/* G-code file icon */}
                      <svg
                        className="shrink-0 text-sky-400"
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
                        className="flex-1 min-w-0 text-[10px] truncate text-content"
                        title={fileName}
                      >
                        {fileName}
                      </span>
                      <button
                        className={`ml-1 shrink-0 ${
                          isJobActive
                            ? "text-content-faint opacity-30 cursor-not-allowed"
                            : "text-content-faint hover:text-accent"
                        }`}
                        title={
                          isJobActive
                            ? "Cannot clear toolpath while job is running"
                            : "Clear toolpath"
                        }
                        disabled={isJobActive}
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
                      <div className="pl-6 pr-3 pb-2 pt-1 border-t border-border-ui/20 space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-content-faint">Size</span>
                          <span className="text-content font-mono">
                            {formatBytes(gcodeToolpath.fileSizeBytes)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-content-faint">Lines</span>
                          <span className="text-content font-mono">
                            {gcodeToolpath.lineCount.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-content-faint">
                            Est. duration
                          </span>
                          <span className="text-content font-mono">
                            {duration}
                          </span>
                        </div>
                        {gcodeToolpath.feedrate > 0 && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-content-faint">Feedrate</span>
                            <span className="text-content font-mono">
                              {Math.round(gcodeToolpath.feedrate)} mm/min
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* ── Groups header ("+ Add group" button) ────────────── */}
            {imports.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 border-b border-border-ui/50">
                <span className="text-[10px] text-content-faint uppercase tracking-wider flex-1">
                  Layers
                </span>
                <button
                  className="text-content-faint hover:text-accent text-xs leading-none px-1"
                  title="Add layer group"
                  onClick={() => {
                    const n = layerGroups.length + 1;
                    addLayerGroup(
                      `Group ${n}`,
                      GROUP_COLORS[layerGroups.length % GROUP_COLORS.length],
                    );
                  }}
                >
                  +
                </button>
              </div>
            )}

            {/* ── Layer groups (collapsible) + ungrouped imports ──────── */}
            {imports.length > 0 &&
              (() => {
                const ungroupedImports = imports.filter(
                  (i) => !layerGroups.some((g) => g.importIds.includes(i.id)),
                );

                /** Renders a single import row (used both in groups and ungrouped). */
                const renderImport = (
                  imp: (typeof imports)[0],
                  indented: boolean,
                ) => {
                  const isSelected = imp.id === selectedImportId;
                  const isExpanded = expandedIds.has(imp.id);
                  const groupId = importGroupId(imp.id);
                  const groupColor =
                    layerGroups.find((g) => g.id === groupId)?.color ?? null;

                  return (
                    <div
                      key={imp.id}
                      className={`border-b border-border-ui/20 ${isSelected ? "bg-secondary/20" : ""} ${draggingImportId === imp.id ? "opacity-40" : ""}`}
                      style={{
                        ...(groupColor && !indented
                          ? { borderLeft: `3px solid ${groupColor}` }
                          : {}),
                      }}
                    >
                      {/* Import header row */}
                      <div
                        className={`flex items-center gap-1 py-1.5 cursor-pointer hover:bg-secondary/20 ${indented ? "pl-5 pr-2" : "px-2"}`}
                        onClick={() => selectImport(isSelected ? null : imp.id)}
                      >
                        {/* Drag handle */}
                        <span
                          className="text-content-faint hover:text-content-muted shrink-0 mr-0.5 select-none"
                          style={{ cursor: "grab", fontSize: "10px" }}
                          title="Drag to a group"
                          draggable
                          onDragStart={(e) => {
                            setDraggingImportId(imp.id);
                            e.dataTransfer.setData("text/plain", imp.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDraggingImportId(null);
                            setDragOverGroupId(null);
                          }}
                        >
                          ⠿
                        </span>
                        {/* Expand toggle */}
                        <button
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "Collapse paths" : "Expand paths"}
                          className="text-content-faint hover:text-content text-[10px] w-4 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(imp.id);
                          }}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>

                        {/* Visibility */}
                        <span
                          className="text-content-faint hover:text-content text-[10px] cursor-pointer shrink-0"
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
                            className="flex-1 min-w-0 bg-app border border-accent rounded px-1 text-[10px] outline-none"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setEditingName({
                                id: imp.id,
                                value: e.target.value,
                              })
                            }
                            onBlur={() => {
                              updateImport(imp.id, {
                                name: editingName!.value,
                              });
                              setEditingName(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                updateImport(imp.id, {
                                  name: editingName!.value,
                                });
                                setEditingName(null);
                              }
                              if (e.key === "Escape") setEditingName(null);
                            }}
                          />
                        ) : (
                          <span
                            className="flex-1 min-w-0 text-[10px] truncate text-content"
                            title="Double-click to rename"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingName({ id: imp.id, value: imp.name });
                            }}
                          >
                            {imp.name}
                          </span>
                        )}

                        <span className="text-[9px] text-content-faint shrink-0 ml-1">
                          {imp.paths.length}p
                        </span>
                        <button
                          className="ml-1 text-content-faint hover:text-accent shrink-0"
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
                        <div className="pl-6 pb-1 border-t border-border-ui/20">
                          {imp.paths.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center gap-1 py-0.5 text-[9px]"
                            >
                              <span
                                className="text-content-faint hover:text-content cursor-pointer"
                                onClick={() =>
                                  updatePath(imp.id, p.id, {
                                    visible: !p.visible,
                                  })
                                }
                                title="Toggle path visibility"
                              >
                                {p.visible ? "👁" : "○"}
                              </span>
                              <span className="flex-1 min-w-0 text-content-faint truncate">
                                {p.label ??
                                  p.layer ??
                                  `path ${p.id.slice(0, 6)}`}
                              </span>
                              <button
                                className="text-content-faint hover:text-accent"
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
                        <div
                          className="px-3 pb-3 pt-2 border-t border-border-ui/30"
                          onDragStart={(e) => e.stopPropagation()}
                        >
                          {(() => {
                            const objW =
                              imp.svgWidth * (imp.scaleX ?? imp.scale);
                            const objH =
                              imp.svgHeight * (imp.scaleY ?? imp.scale);
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
                                    "p-1 text-content-faint hover:text-content rounded hover:bg-secondary/40 transition-colors";
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
                                        <AlignHorizontalJustifyStart
                                          size={13}
                                        />
                                      </button>
                                      <button
                                        className={btnCls}
                                        title={`Centre horizontally (X = ${Math.round(((bedW - objW) / 2) * 10) / 10} mm)`}
                                        onClick={() =>
                                          alignH((bedW - objW) / 2)
                                        }
                                      >
                                        <AlignHorizontalJustifyCenter
                                          size={13}
                                        />
                                      </button>
                                      <button
                                        className={btnCls}
                                        title={`Align right edge to bed right (X = ${Math.round((bedW - objW) * 10) / 10} mm)`}
                                        onClick={() => alignH(bedW - objW)}
                                      >
                                        <AlignHorizontalJustifyEnd size={13} />
                                      </button>
                                      <div className="w-px h-3 bg-border-ui mx-0.5" />
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
                                        onClick={() =>
                                          alignV((bedH - objH) / 2)
                                        }
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
                                    <label className="block text-[10px] text-content-muted mb-0.5">
                                      W (mm)
                                    </label>
                                    <input
                                      type="number"
                                      value={Math.round(objW * 1000) / 1000}
                                      step={0.5}
                                      min={0.001}
                                      onChange={(e) => {
                                        const v = Math.max(
                                          0.001,
                                          +e.target.value,
                                        );
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
                                      className="w-full bg-app border border-border-ui rounded px-2 py-1 text-xs text-content focus:border-accent outline-none"
                                    />
                                  </div>
                                  {/* Ratio lock button */}
                                  <button
                                    className={`mb-2 p-1.5 rounded transition-colors ${
                                      ratioLocked
                                        ? "text-accent hover:text-accent hover:bg-secondary/40"
                                        : "text-content-faint hover:text-content hover:bg-secondary/40"
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
                                    <label className="block text-[10px] text-content-muted mb-0.5">
                                      H (mm)
                                    </label>
                                    <input
                                      type="number"
                                      value={Math.round(objH * 1000) / 1000}
                                      step={0.5}
                                      min={0.001}
                                      onChange={(e) => {
                                        const v = Math.max(
                                          0.001,
                                          +e.target.value,
                                        );
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
                                      className="w-full bg-app border border-border-ui rounded px-2 py-1 text-xs text-content focus:border-accent outline-none"
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
                                        className="p-1.5 text-content-muted hover:text-content transition-colors rounded hover:bg-secondary/40"
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
                                        className="p-1.5 text-content-muted hover:text-content transition-colors rounded hover:bg-secondary/40"
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
                                    className="p-1.5 text-content-muted hover:text-content transition-colors rounded hover:bg-secondary/40"
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
                                    className="p-1.5 text-content-muted hover:text-content transition-colors rounded hover:bg-secondary/40"
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
                                      className="flex items-center gap-0.5 px-1.5 py-1 text-[10px] text-content-muted hover:text-content rounded hover:bg-secondary/40 transition-colors"
                                      title="Change rotation step"
                                      onClick={() =>
                                        setStepFlyoutOpen((o) => !o)
                                      }
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
                                          onClick={() =>
                                            setStepFlyoutOpen(false)
                                          }
                                        />
                                        <div className="absolute bottom-full left-0 mb-1 bg-panel border border-border-ui rounded shadow-xl z-20 py-0.5 min-w-[4rem]">
                                          {ROT_STEPS.map((s) => (
                                            <button
                                              key={s}
                                              className={`block w-full text-left px-3 py-1 text-[10px] transition-colors ${
                                                rotStep === s
                                                  ? "text-content bg-secondary"
                                                  : "text-content-muted hover:text-content hover:bg-secondary/50"
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
                                    className={`p-1.5 transition-colors rounded hover:bg-secondary/40 ${
                                      showCentreMarker
                                        ? "text-accent hover:text-accent"
                                        : "text-content-faint hover:text-content"
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
                                    className="p-1.5 text-content-muted hover:text-accent transition-colors rounded hover:bg-secondary/40"
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

                                {/* ── Stroke width ──────────────────────────── */}
                                <div className="mt-2 pt-2 border-t border-border-ui/30">
                                  <span className="text-[10px] text-content-muted uppercase tracking-wider block mb-1.5">
                                    Stroke width
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="range"
                                      aria-label="Stroke width"
                                      min={0}
                                      max={10}
                                      step={0.1}
                                      value={
                                        imp.strokeWidthMM ??
                                        DEFAULT_STROKE_WIDTH_MM
                                      }
                                      onChange={(e) =>
                                        syncStrokeWidth(
                                          imp.id,
                                          Math.max(0, +e.target.value),
                                        )
                                      }
                                      className="flex-1 accent-accent"
                                    />
                                    <input
                                      type="number"
                                      aria-label="Stroke width value"
                                      min={0}
                                      max={10}
                                      step={0.1}
                                      value={
                                        Math.round(
                                          (imp.strokeWidthMM ??
                                            DEFAULT_STROKE_WIDTH_MM) * 1000,
                                        ) / 1000
                                      }
                                      onChange={(e) => {
                                        const v = e.target.valueAsNumber;
                                        if (Number.isFinite(v) && v >= 0)
                                          syncStrokeWidth(
                                            imp.id,
                                            Math.max(0, v),
                                          );
                                      }}
                                      className="w-14 bg-app border border-border-ui rounded px-1.5 py-1 text-xs text-content focus:border-accent outline-none"
                                    />
                                    <span className="text-[10px] text-content-faint shrink-0">
                                      mm
                                    </span>
                                  </div>
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
                                    <div className="mt-2 pt-2 border-t border-border-ui/30">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span
                                          id={`hatch-label-${imp.id}`}
                                          className="text-[10px] text-content-muted uppercase tracking-wider flex-1"
                                        >
                                          Hatch fill
                                        </span>
                                        <button
                                          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors ${
                                            imp.hatchEnabled
                                              ? "bg-accent"
                                              : "bg-secondary"
                                          }`}
                                          role="switch"
                                          aria-checked={imp.hatchEnabled}
                                          aria-labelledby={`hatch-label-${imp.id}`}
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
                                            (v) => {
                                              if (Number.isFinite(v))
                                                applyHatch(
                                                  imp.id,
                                                  Math.max(0.1, v),
                                                  imp.hatchAngleDeg,
                                                  true,
                                                );
                                            },
                                            0.1,
                                            0.1,
                                          )}
                                          {numField(
                                            "Angle (°)",
                                            imp.hatchAngleDeg,
                                            (v) => {
                                              if (Number.isFinite(v))
                                                applyHatch(
                                                  imp.id,
                                                  imp.hatchSpacingMM,
                                                  ((v % 180) + 180) % 180,
                                                  true,
                                                );
                                            },
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
                }; // end renderImport

                return (
                  <>
                    {/* Grouped imports — one collapsible section per group */}
                    {layerGroups.map((group) => {
                      const members = group.importIds
                        .map((id) => imports.find((i) => i.id === id))
                        .filter(Boolean) as (typeof imports)[0][];
                      const isCollapsed = collapsedGroupIds.has(group.id);
                      const isDropTarget = dragOverGroupId === group.id;

                      return (
                        <div
                          key={group.id}
                          className="border-b border-border-ui/40"
                        >
                          {/* Group header row */}
                          <div
                            className={`flex items-center gap-1.5 px-2 py-1 transition-colors cursor-pointer ${
                              selectedGroupId === group.id
                                ? "bg-secondary/20 ring-1 ring-inset ring-secondary/40"
                                : isDropTarget
                                  ? "bg-accent/15 ring-1 ring-inset ring-accent/30"
                                  : "hover:bg-secondary/10"
                            }`}
                            onClick={(e) => {
                              if (
                                (e.target as HTMLElement).closest(
                                  "button, input",
                                )
                              )
                                return;
                              selectGroup(
                                selectedGroupId === group.id ? null : group.id,
                              );
                            }}
                            onDragOver={(e) => {
                              if (draggingImportId) {
                                e.preventDefault();
                                setDragOverGroupId(group.id);
                              }
                            }}
                            onDragLeave={(e) => {
                              if (
                                !e.currentTarget.contains(
                                  e.relatedTarget as Node,
                                )
                              )
                                setDragOverGroupId(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const id = e.dataTransfer.getData("text/plain");
                              if (id) {
                                assignImportToGroup(id, group.id);
                                // Auto-expand on drop
                                setCollapsedGroupIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(group.id);
                                  return next;
                                });
                              }
                              setDraggingImportId(null);
                              setDragOverGroupId(null);
                            }}
                          >
                            {/* Collapse toggle */}
                            <button
                              aria-expanded={!isCollapsed}
                              aria-label={isCollapsed ? "Expand group" : "Collapse group"}
                              className="text-content-faint hover:text-content text-[10px] w-4 shrink-0"
                              onClick={() => toggleGroupCollapse(group.id)}
                            >
                              {isCollapsed ? "▸" : "▾"}
                            </button>
                            {/* Color swatch / picker */}
                            <input
                              type="color"
                              value={group.color}
                              onChange={(e) =>
                                updateLayerGroup(group.id, {
                                  color: e.target.value,
                                })
                              }
                              className="cursor-pointer border-0 rounded shrink-0"
                              style={{ width: 14, height: 14, padding: 0 }}
                              title="Group colour"
                              onClick={(e) => e.stopPropagation()}
                            />
                            {/* Editable name */}
                            {editingGroupName?.id === group.id ? (
                              <input
                                type="text"
                                className="flex-1 min-w-0 bg-transparent text-[10px] text-content border-b border-accent outline-none"
                                value={editingGroupName.value}
                                autoFocus
                                onChange={(e) =>
                                  setEditingGroupName({
                                    id: group.id,
                                    value: e.target.value,
                                  })
                                }
                                onBlur={() => {
                                  updateLayerGroup(group.id, {
                                    name:
                                      editingGroupName.value.trim() ||
                                      group.name,
                                  });
                                  setEditingGroupName(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    updateLayerGroup(group.id, {
                                      name:
                                        editingGroupName.value.trim() ||
                                        group.name,
                                    });
                                    setEditingGroupName(null);
                                  }
                                  if (e.key === "Escape")
                                    setEditingGroupName(null);
                                }}
                              />
                            ) : (
                              <span
                                className="flex-1 min-w-0 text-[10px] text-content font-medium truncate cursor-pointer"
                                title="Double-click to rename"
                                onDoubleClick={() =>
                                  setEditingGroupName({
                                    id: group.id,
                                    value: group.name,
                                  })
                                }
                              >
                                {group.name}
                              </span>
                            )}
                            {/* Member count badge */}
                            <span className="text-[9px] text-content-faint shrink-0">
                              {members.length}
                            </span>
                            {/* Delete group */}
                            <button
                              className="text-content-faint hover:text-accent shrink-0"
                              title="Delete group (layers become ungrouped)"
                              onClick={() => removeLayerGroup(group.id)}
                            >
                              ✕
                            </button>
                          </div>

                          {/* Members (indented), hidden when collapsed */}
                          {!isCollapsed && (
                            <div>
                              {members.map((imp) => renderImport(imp, true))}
                              {/* Drop hint when group is empty */}
                              {members.length === 0 && (
                                <div
                                  className={`mx-3 mb-1 px-2 py-1 text-[9px] text-center border border-dashed rounded transition-colors ${
                                    isDropTarget
                                      ? "border-accent/50 text-accent/60"
                                      : "border-border-ui text-content-faint"
                                  }`}
                                >
                                  Drop layers here
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Ungrouped imports + ungroup drop zone */}
                    <div
                      onDragOver={(e) => {
                        if (
                          draggingImportId &&
                          importGroupId(draggingImportId)
                        ) {
                          e.preventDefault();
                          setDragOverGroupId("none");
                        }
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node))
                          setDragOverGroupId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain");
                        if (id) assignImportToGroup(id, null);
                        setDraggingImportId(null);
                        setDragOverGroupId(null);
                      }}
                      className={
                        dragOverGroupId === "none"
                          ? "bg-accent/5 ring-1 ring-inset ring-accent/20"
                          : ""
                      }
                    >
                      {ungroupedImports.map((imp) => renderImport(imp, false))}
                      {/* Always-visible ungroup hint — only shown while dragging a grouped layer */}
                      {draggingImportId && importGroupId(draggingImportId) && (
                        <div
                          className={`mx-2 my-1 px-2 py-1 text-[9px] text-center border border-dashed rounded transition-colors ${
                            dragOverGroupId === "none"
                              ? "border-accent/60 text-accent/70 bg-accent/10"
                              : "border-border-ui text-content-faint"
                          }`}
                        >
                          Drop here to remove from group
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
          </>
        )}
      </div>
    </div>
  );
}
