/**
 * GcodeOptionsDialog
 *
 * Modal presented before G-code generation that lets the user choose:
 *   • Whether to run path optimisation (nearest-neighbour reorder)
 *   • Whether to upload the result directly to the machine SD card
 *   • Whether to save the result to the local computer
 *
 * All three preferences are persisted to localStorage so they survive
 * between app sessions.
 */

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useMachineStore } from "../store/machineStore";
import { useCanvasStore } from "../store/canvasStore";
import {
  loadGcodePrefs,
  saveGcodePrefs,
  type GcodePrefs,
} from "../features/gcode-options/gcodePrefs";
import {
  parseNonNegativeNumber,
  parsePositiveNumber,
} from "../features/gcode-options/gcodePrefsValidation";
import { PathsSection } from "../features/gcode-options/components/PathsSection";

export {
  loadGcodePrefs,
  saveGcodePrefs,
} from "../features/gcode-options/gcodePrefs";
export type { GcodePrefs } from "../features/gcode-options/gcodePrefs";

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onConfirm: (prefs: GcodePrefs) => void;
  onCancel: () => void;
}

export function GcodeOptionsDialog({ onConfirm, onCancel }: Props) {
  const connected = useMachineStore((s) => s.connected);
  const layerGroupCount = useCanvasStore((s) => s.layerGroups.length);
  const pageTemplate = useCanvasStore((s) => s.pageTemplate);
  const [prefs, setPrefs] = useState<GcodePrefs>(loadGcodePrefs);
  const [pathsOpen, setPathsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(true);
  const [customGcodeOpen, setCustomGcodeOpen] = useState(false);

  const toggle = (key: keyof GcodePrefs) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const setTextField = (key: keyof GcodePrefs) => (val: string) =>
    setPrefs((p) => ({ ...p, [key]: val }));

  const setJoinTolerance = (val: string) => {
    const n = parsePositiveNumber(val);
    if (n !== null) setPrefs((p) => ({ ...p, joinTolerance: n }));
  };

  const neitherOutput = !prefs.uploadToSd && !prefs.saveLocally;

  const handleConfirm = () => {
    saveGcodePrefs(prefs);
    onConfirm(prefs);
  };

  // Allow Escape to cancel
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && !neitherOutput) handleConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gcode-options-title"
        className="bg-panel border border-border-ui rounded-lg shadow-2xl w-[420px] p-5 flex flex-col gap-4"
      >
        {/* Title */}
        <h2
          id="gcode-options-title"
          className="text-content font-semibold text-sm tracking-widest uppercase"
        >
          Generate G-code
        </h2>

        {/* ── Collapsible sections ── */}
        <div className="flex flex-col gap-1">
          <PathsSection
            open={pathsOpen}
            prefs={prefs}
            onToggleOpen={() => setPathsOpen((o) => !o)}
            onTogglePref={toggle}
            onJoinToleranceChange={setJoinTolerance}
          />

          <div className="border-t border-border-ui" />

          {/* ────────────── OPTIONS ────────────── */}
          <div>
            <button
              type="button"
              onClick={() => setOptionsOpen((o) => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold text-content-faint hover:text-content uppercase tracking-wider transition-colors select-none w-full text-left py-1"
            >
              <ChevronDown
                size={13}
                className={`transition-transform duration-150 flex-shrink-0 ${optionsOpen ? "rotate-0" : "-rotate-90"}`}
              />
              Options
            </button>
            {optionsOpen && (
              <div className="flex flex-col gap-4 mt-2 mb-1">
                {/* Lift pen at end */}
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    aria-label="Lift pen at end"
                    className="mt-0.5 accent-accent cursor-pointer"
                    checked={prefs.liftPenAtEnd}
                    onChange={() => toggle("liftPenAtEnd")}
                  />
                  <div>
                    <div className="text-sm text-content font-medium">
                      Lift pen at end
                    </div>
                    <div className="text-xs text-content-muted mt-0.5">
                      Send the pen-up command after the last stroke. Recommended
                      to avoid leaving the pen pressed on the paper.
                    </div>
                  </div>
                </label>

                {/* Return to home */}
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    aria-label="Return to home (X0 Y0)"
                    className="mt-0.5 accent-accent cursor-pointer"
                    checked={prefs.returnToHome}
                    onChange={() => toggle("returnToHome")}
                  />
                  <div>
                    <div className="text-sm text-content font-medium">
                      Return to home (X0 Y0)
                    </div>
                    <div className="text-xs text-content-muted mt-0.5">
                      Send the pen to the origin after the job finishes.
                    </div>
                  </div>
                </label>

                {/* ── Page clipping — only shown when a page template is active ── */}
                {pageTemplate && (
                  <div className="flex flex-col gap-1.5 select-none">
                    <div className="text-sm text-white font-medium">
                      Page clipping
                    </div>
                    <div className="flex flex-col gap-1">
                      {(["none", "margin", "page"] as const).map((mode) => (
                        <label
                          key={mode}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name="clipMode"
                            value={mode}
                            checked={prefs.clipMode === mode}
                            onChange={() =>
                              setPrefs((p) => ({ ...p, clipMode: mode }))
                            }
                            className="accent-accent cursor-pointer"
                          />
                          <span className="text-xs text-content">
                            {mode === "none"
                              ? "No clipping"
                              : mode === "margin"
                                ? "Clip to margin"
                                : "Clip to page edge"}
                          </span>
                        </label>
                      ))}
                    </div>
                    {prefs.clipMode === "page" && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-content-muted whitespace-nowrap">
                          Safety inset
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="0.5"
                          value={prefs.clipOffsetMM}
                          onChange={(e) => {
                            const n = parseNonNegativeNumber(e.target.value);
                            if (n !== null)
                              setPrefs((p) => ({ ...p, clipOffsetMM: n }));
                          }}
                          className="w-20 px-2 py-0.5 text-xs rounded bg-secondary border border-secondary-hover text-content focus:outline-none focus:border-accent"
                        />
                        <span className="text-xs text-content-muted">
                          mm from edge
                        </span>
                      </div>
                    )}
                    <div className="text-xs text-content-muted mt-0.5">
                      {prefs.clipMode === "none" &&
                        "G-code is clipped to the machine bed only."}
                      {prefs.clipMode === "margin" &&
                        "Clips to the margin boundary shown on canvas."}
                      {prefs.clipMode === "page" &&
                        "Clips to the page edge. Add an inset to keep the pen safely on the paper."}
                    </div>
                  </div>
                )}

                {/* ── Custom G-code sub-collapsible ── */}
                <button
                  type="button"
                  onClick={() => setCustomGcodeOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs text-content-muted hover:text-content transition-colors select-none w-fit"
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-150 ${customGcodeOpen ? "rotate-0" : "-rotate-90"}`}
                  />
                  Custom G-code
                  {(prefs.customStartGcode || prefs.customEndGcode) && (
                    <span className="ml-1 w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                  )}
                </button>

                {customGcodeOpen && (
                  <div className="flex flex-col gap-3 pl-1">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-content-muted select-none">
                        Start G-code
                        <span className="ml-1 text-content-faint">
                          (after preamble)
                        </span>
                      </label>
                      <textarea
                        aria-label="Custom start G-code"
                        rows={3}
                        value={prefs.customStartGcode}
                        onChange={(e) =>
                          setTextField("customStartGcode")(e.target.value)
                        }
                        placeholder="; e.g. M3 S0"
                        spellCheck={false}
                        className="w-full px-2 py-1.5 text-xs font-mono rounded bg-secondary border border-secondary-hover text-content placeholder-content-faint focus:outline-none focus:border-accent resize-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-content-muted select-none">
                        End G-code
                        <span className="ml-1 text-content-faint">
                          (after lift / return)
                        </span>
                      </label>
                      <textarea
                        aria-label="Custom end G-code"
                        rows={3}
                        value={prefs.customEndGcode}
                        onChange={(e) =>
                          setTextField("customEndGcode")(e.target.value)
                        }
                        placeholder="; e.g. M5"
                        spellCheck={false}
                        className="w-full px-2 py-1.5 text-xs font-mono rounded bg-secondary border border-secondary-hover text-content placeholder-content-faint focus:outline-none focus:border-accent resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border-ui" />

          {/* ────────────── OUTPUT ────────────── */}
          <div>
            <button
              type="button"
              onClick={() => setOutputOpen((o) => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold text-content-faint hover:text-content uppercase tracking-wider transition-colors select-none w-full text-left py-1"
            >
              <ChevronDown
                size={13}
                className={`transition-transform duration-150 flex-shrink-0 ${outputOpen ? "rotate-0" : "-rotate-90"}`}
              />
              Output
            </button>
            {outputOpen && (
              <div className="flex flex-col gap-4 mt-2 mb-1">
                {/* Upload to SD card */}
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    aria-label="Upload to SD card"
                    className="mt-0.5 accent-accent cursor-pointer"
                    checked={prefs.uploadToSd}
                    onChange={() => toggle("uploadToSd")}
                  />
                  <div className="min-w-0">
                    <div className="text-sm text-content font-medium flex items-center flex-wrap gap-x-1.5">
                      Upload to SD card
                      {!connected && (
                        <span className="text-xs text-amber-400 font-normal">
                          (not connected — will be skipped)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-content-muted mt-0.5">
                      Upload the generated file directly to the machine SD card
                      root. Auto-selects it as the queued job.
                    </div>
                  </div>
                </label>

                {/* Save to local computer */}
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    aria-label="Save to computer"
                    className="mt-0.5 accent-accent cursor-pointer"
                    checked={prefs.saveLocally}
                    onChange={() => toggle("saveLocally")}
                  />
                  <div>
                    <div className="text-sm text-content font-medium">
                      Save to computer
                    </div>
                    <div className="text-xs text-content-muted mt-0.5">
                      Open a save dialog to choose where to write the G-code
                      file on this computer.
                    </div>
                  </div>
                </label>

                {/* Export one file per group */}
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    aria-label="Export one file per group"
                    className="mt-0.5 accent-accent cursor-pointer"
                    checked={prefs.exportPerGroup}
                    onChange={() => toggle("exportPerGroup")}
                  />
                  <div>
                    <div className="text-sm text-content font-medium">
                      Export one file per group
                    </div>
                    <div className="text-xs text-content-muted mt-0.5">
                      Generate a separate G-code file for each layer group —
                      ideal for multi-colour pen plots. Each file is named after
                      its group.
                    </div>
                    {prefs.exportPerGroup && layerGroupCount === 0 && (
                      <div className="text-xs text-amber-400 mt-1">
                        No groups defined — add groups in the Properties panel
                        first.
                      </div>
                    )}
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Validation warning */}
        {neitherOutput && (
          <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-2.5 py-1.5">
            Select at least one output destination — SD card upload or save to
            computer.
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end mt-1">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded bg-secondary hover:bg-secondary-hover transition-colors text-content"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={neitherOutput}
            className="px-3 py-1.5 text-sm rounded bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
