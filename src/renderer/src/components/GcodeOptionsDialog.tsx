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
import { TabHeader } from "./TabHeader";

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

type GcodeOptionsTab = "paths" | "options" | "output";

export function GcodeOptionsDialog({ onConfirm, onCancel }: Props) {
  const connected = useMachineStore((s) => s.connected);
  const activeConfig = useMachineStore((s) => s.activeConfig());
  const { layerGroupCount, colorGroupCount, pageTemplate } = useCanvasStore(
    useShallow(selectGcodeOptionsDialogCanvasState),
  );
  const [prefs, setPrefs] = useState<GcodePrefs>(loadGcodePrefs);
  const [activeTab, setActiveTab] = useState<GcodeOptionsTab>("output");
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

  const setPenUpDelayMs = (val: string) => {
    const n = parseNonNegativeNumber(val);
    if (n !== null) setPrefs((p) => ({ ...p, penUpDelayMs: n }));
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
        className="bg-panel border border-border-ui rounded-lg shadow-2xl w-[420px] h-[min(66vh,760px)] max-h-[90vh] p-5 flex flex-col gap-4"
      >
        {/* Title */}
        <h2
          id="gcode-options-title"
          className="text-content font-semibold text-sm tracking-widest uppercase"
        >
          Generate G-code
        </h2>

        {/* ── Tabs ── */}
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <TabHeader<GcodeOptionsTab>
            ariaLabel="G-code options sections"
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={[
              { id: "paths", label: "Paths" },
              { id: "options", label: "Options" },
              { id: "output", label: "Output" },
            ]}
          />

          <div
            role="tabpanel"
            aria-label={
              activeTab === "paths"
                ? "Paths"
                : activeTab === "options"
                  ? "Options"
                  : "Output"
            }
            className="flex-1 min-h-0 overflow-y-auto pr-1"
          >
            {activeTab === "paths" && (
              <PathsSection
                open={true}
                showHeader={false}
                prefs={prefs}
                onToggleOpen={() => setActiveTab("paths")}
                onTogglePref={toggle}
                onJoinToleranceChange={setJoinTolerance}
              />
            )}

            {activeTab === "options" && (
              <OptionsSection
                open={true}
                showHeader={false}
                customGcodeOpen={customGcodeOpen}
                prefs={prefs}
                machinePenDownDelayMs={activeConfig?.penDownDelayMs ?? 0}
                machinePenUpDelayMs={activeConfig?.penUpDelayMs ?? 0}
                machineDrawSpeed={activeConfig?.drawSpeed ?? 3000}
                hasPageTemplate={!!pageTemplate}
                onToggleOpen={() => setActiveTab("options")}
                onToggleCustomGcodeOpen={() => setCustomGcodeOpen((o) => !o)}
                onTogglePref={toggle}
                onSetPenDownDelayMs={setPenDownDelayMs}
                onSetPenUpDelayMs={setPenUpDelayMs}
                onSetDrawSpeedOverride={setDrawSpeedOverride}
                onSetClipMode={setClipMode}
                onSetClipOffset={setClipOffsetMM}
                onSetTextField={setTextField}
              />
            )}

            {activeTab === "output" && (
              <OutputSection
                open={true}
                showHeader={false}
                connected={connected}
                layerGroupCount={layerGroupCount}
                colorGroupCount={colorGroupCount}
                prefs={prefs}
                onToggleOpen={() => setActiveTab("output")}
                onTogglePref={toggle}
              />
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
