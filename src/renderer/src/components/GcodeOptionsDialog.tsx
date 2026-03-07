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
import { useMachineStore } from "../store/machineStore";

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "terraforge.gcodePrefs";

export interface GcodePrefs {
  optimise: boolean;
  uploadToSd: boolean;
  saveLocally: boolean;
}

const DEFAULTS: GcodePrefs = {
  optimise: true,
  uploadToSd: true,
  saveLocally: false,
};

function loadPrefs(): GcodePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GcodePrefs>;
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // Corrupt data — fall back to defaults
  }
  return { ...DEFAULTS };
}

export function saveGcodePrefs(prefs: GcodePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable — non-fatal
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onConfirm: (prefs: GcodePrefs) => void;
  onCancel: () => void;
}

export function GcodeOptionsDialog({ onConfirm, onCancel }: Props) {
  const connected = useMachineStore((s) => s.connected);
  const [prefs, setPrefs] = useState<GcodePrefs>(loadPrefs);

  const toggle = (key: keyof GcodePrefs) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

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
      <div className="bg-[#16213e] border border-[#0f3460] rounded-lg shadow-2xl w-[340px] p-5 flex flex-col gap-4">
        {/* Title */}
        <h2 className="text-white font-semibold text-base tracking-wide">
          Generate G-code
        </h2>

        {/* Options */}
        <div className="flex flex-col gap-4">
          {/* ── Optimise paths ── */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 accent-[#e94560] cursor-pointer"
              checked={prefs.optimise}
              onChange={() => toggle("optimise")}
            />
            <div>
              <div className="text-sm text-white font-medium">
                Optimise paths
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Reorder subpaths with a nearest-neighbour algorithm to minimise
                total rapid-travel distance between strokes.
              </div>
            </div>
          </label>

          <div className="border-t border-[#0f3460]" />

          <div className="text-xs text-gray-500 uppercase tracking-wider -mb-1">
            Output
          </div>

          {/* ── Upload to SD card ── */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 accent-[#e94560] cursor-pointer"
              checked={prefs.uploadToSd}
              onChange={() => toggle("uploadToSd")}
            />
            <div className="min-w-0">
              <div className="text-sm text-white font-medium flex items-center flex-wrap gap-x-1.5">
                Upload to SD card
                {!connected && (
                  <span className="text-xs text-amber-400 font-normal">
                    (not connected — will be skipped)
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Upload the generated file directly to the machine SD card root.
                Auto-selects it as the queued job.
              </div>
            </div>
          </label>

          {/* ── Save to local computer ── */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 accent-[#e94560] cursor-pointer"
              checked={prefs.saveLocally}
              onChange={() => toggle("saveLocally")}
            />
            <div>
              <div className="text-sm text-white font-medium">
                Save to computer
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Open a save dialog to choose where to write the G-code file on
                this computer.
              </div>
            </div>
          </label>
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
            className="px-3 py-1.5 text-sm rounded bg-[#0f3460] hover:bg-[#1a4a8a] transition-colors text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={neitherOutput}
            className="px-3 py-1.5 text-sm rounded bg-[#e94560] hover:bg-[#c73d56] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
