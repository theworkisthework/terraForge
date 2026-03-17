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

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "terraforge.gcodePrefs";

export interface GcodePrefs {
  optimise: boolean;
  uploadToSd: boolean;
  saveLocally: boolean;
  joinPaths: boolean;
  joinTolerance: number; // mm
  liftPenAtEnd: boolean;
  returnToHome: boolean;
  customStartGcode: string;
  customEndGcode: string;
  /** Hatch-fill settings — applied at SVG import time, not at G-code generation */
  hatchFill: boolean;
  hatchSpacingMM: number;
  hatchAngleDeg: number;
}

const DEFAULTS: GcodePrefs = {
  optimise: true,
  uploadToSd: true,
  saveLocally: false,
  joinPaths: false,
  joinTolerance: 0.2,
  liftPenAtEnd: true,
  returnToHome: false,
  customStartGcode: "",
  customEndGcode: "",
  hatchFill: true,
  hatchSpacingMM: 2,
  hatchAngleDeg: 45,
};

export function loadGcodePrefs(): GcodePrefs {
  return loadPrefs();
}

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
  const [customGcodeOpen, setCustomGcodeOpen] = useState(false);

  const toggle = (key: keyof GcodePrefs) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const setTextField = (key: keyof GcodePrefs) => (val: string) =>
    setPrefs((p) => ({ ...p, [key]: val }));

  const setJoinTolerance = (val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) setPrefs((p) => ({ ...p, joinTolerance: n }));
  };

  const setHatchSpacing = (val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) setPrefs((p) => ({ ...p, hatchSpacingMM: n }));
  };

  const setHatchAngle = (val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n))
      setPrefs((p) => ({ ...p, hatchAngleDeg: ((n % 180) + 180) % 180 }));
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
      <div className="bg-[#16213e] border border-[#0f3460] rounded-lg shadow-2xl w-[420px] p-5 flex flex-col gap-4">
        {/* Title */}
        <h2 className="text-white font-semibold text-sm tracking-widest uppercase">
          Options
        </h2>

        {/* Options */}
        <div className="flex flex-col gap-4">
          {/* ── Optimise paths ── */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Optimise paths"
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

          {/* ── Join nearby paths ── */}
          <div className="flex items-start gap-3 select-none">
            <input
              type="checkbox"
              aria-label="Join nearby paths"
              className="mt-0.5 accent-[#e94560] cursor-pointer flex-shrink-0"
              checked={prefs.joinPaths}
              onChange={() => toggle("joinPaths")}
              id="join-paths-cb"
            />
            <div className="flex-1 min-w-0">
              <label
                htmlFor="join-paths-cb"
                className="cursor-pointer flex items-center gap-2 flex-wrap"
              >
                <span className="text-sm text-white font-medium">
                  Join nearby paths
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 leading-none">
                  Experimental
                </span>
              </label>
              <div className="text-xs text-gray-400 mt-0.5">
                Connect path endpoints within the tolerance below, skipping pen
                up/down between nearly-touching strokes.
              </div>
              <div
                className={`flex items-center gap-2 mt-2 transition-opacity ${prefs.joinPaths ? "opacity-100" : "opacity-30 pointer-events-none"}`}
              >
                <label className="text-xs text-gray-400 whitespace-nowrap">
                  Tolerance
                </label>
                <input
                  type="number"
                  min="0.01"
                  max="10"
                  step="0.05"
                  value={prefs.joinTolerance}
                  onChange={(e) => setJoinTolerance(e.target.value)}
                  disabled={!prefs.joinPaths}
                  className="w-20 px-2 py-0.5 text-xs rounded bg-[#0f3460] border border-[#1a4a8a] text-white focus:outline-none focus:border-[#e94560]"
                />
                <span className="text-xs text-gray-400">mm</span>
              </div>
            </div>
          </div>

          {/* ── Hatch fill ── */}
          <div className="flex items-start gap-3 select-none">
            <input
              type="checkbox"
              aria-label="Hatch filled shapes"
              className="mt-0.5 accent-[#e94560] cursor-pointer flex-shrink-0"
              checked={prefs.hatchFill}
              onChange={() => toggle("hatchFill")}
              id="hatch-fill-cb"
            />
            <div className="flex-1 min-w-0">
              <label
                htmlFor="hatch-fill-cb"
                className="cursor-pointer text-sm text-white font-medium"
              >
                Hatch filled shapes
              </label>
              <div className="text-xs text-gray-400 mt-0.5">
                Generate hatch-fill lines inside SVG shapes that have a fill
                colour. Applied at import time — re-import to update.
              </div>
              <div
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 transition-opacity ${
                  prefs.hatchFill
                    ? "opacity-100"
                    : "opacity-30 pointer-events-none"
                }`}
              >
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400 whitespace-nowrap">
                    Spacing
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    max="50"
                    step="0.5"
                    value={prefs.hatchSpacingMM}
                    onChange={(e) => setHatchSpacing(e.target.value)}
                    disabled={!prefs.hatchFill}
                    className="w-20 px-2 py-0.5 text-xs rounded bg-[#0f3460] border border-[#1a4a8a] text-white focus:outline-none focus:border-[#e94560]"
                  />
                  <span className="text-xs text-gray-400">mm</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400 whitespace-nowrap">
                    Angle
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="179"
                    step="5"
                    value={prefs.hatchAngleDeg}
                    onChange={(e) => setHatchAngle(e.target.value)}
                    disabled={!prefs.hatchFill}
                    className="w-20 px-2 py-0.5 text-xs rounded bg-[#0f3460] border border-[#1a4a8a] text-white focus:outline-none focus:border-[#e94560]"
                  />
                  <span className="text-xs text-gray-400">°</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-[#0f3460]" />

          {/* ── Options (lift / return) ── */}
          <div className="text-xs text-gray-500 uppercase tracking-wider -mb-1">
            Options
          </div>

          {/* Lift pen at end */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Lift pen at end"
              className="mt-0.5 accent-[#e94560] cursor-pointer"
              checked={prefs.liftPenAtEnd}
              onChange={() => toggle("liftPenAtEnd")}
            />
            <div>
              <div className="text-sm text-white font-medium">
                Lift pen at end
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Send the pen-up command after the last stroke. Recommended to
                avoid leaving the pen pressed on the paper.
              </div>
            </div>
          </label>

          {/* Return to home */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Return to home (X0 Y0)"
              className="mt-0.5 accent-[#e94560] cursor-pointer"
              checked={prefs.returnToHome}
              onChange={() => toggle("returnToHome")}
            />
            <div>
              <div className="text-sm text-white font-medium">
                Return to home (X0 Y0)
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Send the pen to the origin after the job finishes.
              </div>
            </div>
          </label>

          {/* ── Custom G-code collapsible ── */}
          <button
            type="button"
            onClick={() => setCustomGcodeOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors select-none w-fit"
          >
            <ChevronDown
              size={14}
              className={`transition-transform duration-150 ${
                customGcodeOpen ? "rotate-0" : "-rotate-90"
              }`}
            />
            Custom G-code
            {(prefs.customStartGcode || prefs.customEndGcode) && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#e94560] inline-block" />
            )}
          </button>

          {customGcodeOpen && (
            <div className="flex flex-col gap-3 pl-1">
              {/* Custom start G-code */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 select-none">
                  Start G-code
                  <span className="ml-1 text-gray-600">(after preamble)</span>
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
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#0f3460] border border-[#1a4a8a] text-white placeholder-gray-600 focus:outline-none focus:border-[#e94560] resize-none"
                />
              </div>
              {/* Custom end G-code */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 select-none">
                  End G-code
                  <span className="ml-1 text-gray-600">
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
                  className="w-full px-2 py-1.5 text-xs font-mono rounded bg-[#0f3460] border border-[#1a4a8a] text-white placeholder-gray-600 focus:outline-none focus:border-[#e94560] resize-none"
                />
              </div>
            </div>
          )}

          <div className="border-t border-[#0f3460]" />

          <div className="text-xs text-gray-500 uppercase tracking-wider -mb-1">
            Output
          </div>

          {/* ── Upload to SD card ── */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Upload to SD card"
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
              aria-label="Save to computer"
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
