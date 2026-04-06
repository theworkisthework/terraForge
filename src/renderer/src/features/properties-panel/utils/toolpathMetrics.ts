import type { GcodeToolpath } from "../../../utils/gcodeParser";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function estimateDuration(
  toolpath: GcodeToolpath,
  fallbackFeedrate: number,
): string {
  const feedrate = toolpath.feedrate > 0 ? toolpath.feedrate : fallbackFeedrate;
  if (
    feedrate <= 0 ||
    (toolpath.totalCutDistance === 0 && toolpath.totalRapidDistance === 0)
  ) {
    return "—";
  }

  // Rapid moves run at approximately 5x the job feedrate, capped at 10000 mm/min.
  const rapidRate = Math.min(feedrate * 5, 10000);
  const totalSeconds = Math.round(
    (toolpath.totalCutDistance / feedrate +
      toolpath.totalRapidDistance / rapidRate) *
      60,
  );
  return formatDuration(totalSeconds);
}
