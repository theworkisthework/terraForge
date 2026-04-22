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
import { useShallow } from "zustand/react/shallow";
import { useMachineStore } from "../store/machineStore";
import { useCanvasStore } from "../store/canvasStore";
import { selectGcodeOptionsDialogCanvasState } from "../store/canvasSelectors";
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
import { OptionsSection } from "../features/gcode-options/components/OptionsSection";
import { OutputSection } from "../features/gcode-options/components/OutputSection";

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
  const activeConfig = useMachineStore((s) => s.activeConfig());
  const { layerGroupCount, colorGroupCount, pageTemplate } = useCanvasStore(
    useShallow(selectGcodeOptionsDialogCanvasState),
  );
  const [prefs, setPrefs] = useState<GcodePrefs>(loadGcodePrefs);
  const [pathsOpen, setPathsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(true);
  const [customGcodeOpen, setCustomGcodeOpen] = useState(false);

  const toggle = (key: keyof GcodePrefs) =>
    setPrefs((p) => {
      if (key === "exportPerGroup") {
        const next = !p.exportPerGroup;
        return {
          ...p,
          exportPerGroup: next,
          exportPerColor: next ? false : p.exportPerColor,
        };
      }
      if (key === "exportPerColor") {
        const next = !p.exportPerColor;
        return {
          ...p,
          exportPerColor: next,
          exportPerGroup: next ? false : p.exportPerGroup,
        };
      }
      return { ...p, [key]: !p[key] };
    });

  const setTextField = (key: keyof GcodePrefs) => (val: string) =>
    setPrefs((p) => ({ ...p, [key]: val }));

  const setJoinTolerance = (val: string) => {
    const n = parsePositiveNumber(val);
    if (n !== null) setPrefs((p) => ({ ...p, joinTolerance: n }));
  };

  const setClipOffsetMM = (val: string) => {
    const n = parseNonNegativeNumber(val);
    if (n !== null) setPrefs((p) => ({ ...p, clipOffsetMM: n }));
  };

  const setClipMode = (mode: GcodePrefs["clipMode"]) => {
    setPrefs((p) => ({ ...p, clipMode: mode }));
  };

  const setPenDownDelayMs = (val: string) => {
    const n = parseNonNegativeNumber(val);
    if (n !== null) setPrefs((p) => ({ ...p, penDownDelayMs: n }));
  };

  const setDrawSpeedOverride = (val: string) => {
    const n = parsePositiveNumber(val);
    if (n !== null) setPrefs((p) => ({ ...p, drawSpeedOverride: n }));
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

          <OptionsSection
            open={optionsOpen}
            customGcodeOpen={customGcodeOpen}
            prefs={prefs}
            machinePenDownDelayMs={activeConfig?.penDownDelayMs ?? 0}
            machineDrawSpeed={activeConfig?.drawSpeed ?? 3000}
            hasPageTemplate={!!pageTemplate}
            onToggleOpen={() => setOptionsOpen((o) => !o)}
            onToggleCustomGcodeOpen={() => setCustomGcodeOpen((o) => !o)}
            onTogglePref={toggle}
            onSetPenDownDelayMs={setPenDownDelayMs}
            onSetDrawSpeedOverride={setDrawSpeedOverride}
            onSetClipMode={setClipMode}
            onSetClipOffset={setClipOffsetMM}
            onSetTextField={setTextField}
          />

          <div className="border-t border-border-ui" />

          <OutputSection
            open={outputOpen}
            connected={connected}
            layerGroupCount={layerGroupCount}
            colorGroupCount={colorGroupCount}
            prefs={prefs}
            onToggleOpen={() => setOutputOpen((o) => !o)}
            onTogglePref={toggle}
          />
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
