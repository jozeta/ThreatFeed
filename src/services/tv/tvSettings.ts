import type { TvAnimationSpeed, TvTileSize } from '../../types';

/** Selectable time-per-tile values, in seconds: 30 s to 5 min in 30 s steps */
export const TV_INTERVAL_STEPS: number[] = Array.from({ length: 10 }, (_, i) => (i + 1) * 30);

const DEFAULT_SECONDS = 60;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const nearestStep = (seconds: number): number =>
  TV_INTERVAL_STEPS.reduce((best, s) => (Math.abs(s - seconds) < Math.abs(best - seconds) ? s : best));

/** Seconds win; otherwise convert the legacy minutes setting; otherwise 60. Snapped to a step. */
export function migrateTvInterval(saved: { tvIntervalSeconds?: unknown; tvIntervalMinutes?: unknown }): number {
  const seconds = num(saved.tvIntervalSeconds);
  if (seconds !== null) return nearestStep(seconds);
  const minutes = num(saved.tvIntervalMinutes);
  if (minutes !== null) return nearestStep(minutes * 60);
  return DEFAULT_SECONDS;
}

export function parseTvTileSize(v: unknown): TvTileSize {
  return v === 'large' || v === 'medium' || v === 'small' || v === 'xsmall' ? v : 'medium';
}

export function parseTvAnimationSpeed(v: unknown): TvAnimationSpeed {
  return v === 'slow' || v === 'medium' || v === 'fast' ? v : 'fast';
}
