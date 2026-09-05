// ── useJobEta ──────────────────────────────────────────────────────────────
//
// Live job ETA combining a static per-line duration estimate (geometry +
// configured speeds) with a correction factor derived from actual observed
// pace. This absorbs unmodeled effects — firmware acceleration, cornering,
// feed overrides — without needing to detect them explicitly.
//
// Calibration resets whenever a new run session starts (Idle → Run/Hold).
// The stopwatch pauses while the machine is Held so paused time never counts
// against the correction factor.

import { useEffect, useMemo, useRef, useState } from "react";
import type { MachineConfig, MachineStatus } from "../../../../types";
import type { GcodeSegment } from "../../utils/gcodeParser";
import {
  estimateGcodeDuration,
  findLastEstimateIndexForLine,
  formatEtaDuration,
  type GcodeDurationEstimate,
} from "../../utils/estimateGcodeDuration";

/** Minimum actual run time before the correction factor is trusted enough to display an ETA. */
const MIN_CALIBRATION_MS = 4000;
/** Displayed ETA only refreshes at this cadence — recomputing every status tick made the seconds flicker distractingly. */
const DISPLAY_UPDATE_INTERVAL_MS = 5000;

interface UseJobEtaParams {
  status: MachineStatus | null;
  isRunning: boolean;
  isHeld: boolean;
  segments: GcodeSegment[] | undefined;
  activeConfig: MachineConfig | undefined;
  /** Coordinate-matched completed-segment index from usePlotProgress, used as a
   *  fallback when the firmware doesn't report Ln: in its status. */
  plotProgressFrontierIndex: number | null;
}

export interface JobEtaResult {
  /** Formatted remaining-time label, or null while not active / not yet calibrated. */
  etaLabel: string | null;
  /** Estimated wall-clock completion time as a locale time string, or null. */
  etaTimeLabel: string | null;
}

export function useJobEta({
  status,
  isRunning,
  isHeld,
  segments,
  activeConfig,
  plotProgressFrontierIndex,
}: UseJobEtaParams): JobEtaResult {
  const estimate: GcodeDurationEstimate | null = useMemo(() => {
    if (!segments?.length) return null;
    return estimateGcodeDuration(segments, {
      travelSpeedMmMin: activeConfig?.jogSpeed ?? 3000,
      drawSpeedMmMin: activeConfig?.drawSpeed ?? 3000,
      penDownDelayMs: activeConfig?.penDownDelayMs ?? 0,
      penUpDelayMs: activeConfig?.penUpDelayMs ?? 0,
    });
  }, [segments, activeConfig]);

  // Wall-clock ms accumulated while Run, across pause/resume within one job.
  const runElapsedRef = useRef(0);
  // Wall-clock time the current Run stretch began, or null while Held/Idle.
  const runStartRef = useRef<number | null>(null);
  // Naive estimated ms already elapsed at the moment calibration began.
  const startNaiveMsRef = useRef(0);
  const calibrationStartedRef = useRef(false);
  const wasActiveRef = useRef(false);
  // Last ETA shown to the user and when it was last refreshed — throttles display updates.
  const lastDisplayedEtaMsRef = useRef<number | null>(null);
  const lastDisplayUpdateAtRef = useRef(0);
  // Forces a re-render periodically so the displayed ETA counts down while running.
  const [, forceTick] = useState(0);

  const isActive = isRunning || isHeld;

  // New run session (Idle → Run/Hold) — reset calibration.
  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      runElapsedRef.current = 0;
      runStartRef.current = isRunning ? Date.now() : null;
      startNaiveMsRef.current = 0;
      calibrationStartedRef.current = false;
      lastDisplayedEtaMsRef.current = null;
      lastDisplayUpdateAtRef.current = 0;
    }
    wasActiveRef.current = isActive;
  }, [isActive, isRunning]);

  // Pause/resume — accumulate elapsed run time, excluding held time.
  useEffect(() => {
    if (isRunning) {
      if (runStartRef.current === null) runStartRef.current = Date.now();
    } else if (runStartRef.current !== null) {
      runElapsedRef.current += Date.now() - runStartRef.current;
      runStartRef.current = null;
    }
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(
      () => forceTick((n) => n + 1),
      DISPLAY_UPDATE_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [isRunning]);

  if (!estimate || !isActive) {
    return { etaLabel: null, etaTimeLabel: null };
  }

  // Prefer Ln: from status; fall back to the coordinate-matching frontier
  // (usePlotProgress) for firmware that doesn't report line numbers.
  const idx =
    status?.lineNum != null
      ? findLastEstimateIndexForLine(estimate, status.lineNum)
      : plotProgressFrontierIndex != null
        ? Math.min(plotProgressFrontierIndex, estimate.cumulativeMs.length - 1)
        : -1;
  if (idx < 0) return { etaLabel: null, etaTimeLabel: null };

  const naiveElapsedNow = estimate.cumulativeMs[idx];
  if (!calibrationStartedRef.current) {
    calibrationStartedRef.current = true;
    startNaiveMsRef.current = naiveElapsedNow;
  }

  const naiveElapsedSinceStart = naiveElapsedNow - startNaiveMsRef.current;
  const actualElapsedMs =
    runElapsedRef.current +
    (runStartRef.current !== null ? Date.now() - runStartRef.current : 0);

  if (actualElapsedMs < MIN_CALIBRATION_MS || naiveElapsedSinceStart <= 0) {
    return { etaLabel: "Estimating…", etaTimeLabel: null };
  }

  const correctionFactor = actualElapsedMs / naiveElapsedSinceStart;
  const remainingNaiveMs = estimate.totalMs - naiveElapsedNow;
  const etaMs = Math.max(0, remainingNaiveMs * correctionFactor);

  // Only refresh the displayed value periodically — recomputing on every
  // status tick made the seconds flicker up and down distractingly.
  const now = Date.now();
  if (
    lastDisplayedEtaMsRef.current === null ||
    now - lastDisplayUpdateAtRef.current >= DISPLAY_UPDATE_INTERVAL_MS
  ) {
    lastDisplayedEtaMsRef.current = etaMs;
    lastDisplayUpdateAtRef.current = now;
  }

  const completionTime = new Date(now + lastDisplayedEtaMsRef.current);
  const etaTimeLabel = completionTime.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    etaLabel: formatEtaDuration(lastDisplayedEtaMsRef.current),
    etaTimeLabel,
  };
}
