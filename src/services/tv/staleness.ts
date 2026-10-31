/** How fresh a TV screen's data is: the "Updated 14:05" indicator next to the page counter */

const HOUR = 3_600_000;
export const AMBER_AFTER_MS = HOUR;
export const RED_AFTER_MS = 3 * HOUR;

export type StaleLevel = 'ok' | 'amber' | 'red';

/** When the screen's data was last fresh: the newer of the app's last successful refresh and the snapshot build time */
export function lastFreshAt(lastUpdated: Date | null, snapshotGeneratedAt: string | null): number | null {
  const refresh = lastUpdated ? lastUpdated.getTime() : NaN;
  const snapshot = snapshotGeneratedAt ? Date.parse(snapshotGeneratedAt) : NaN;
  const known = [refresh, snapshot].filter(Number.isFinite);
  return known.length ? Math.max(...known) : null;
}

/** Amber after an hour without fresh data, red after three (and when nothing is known) */
export function staleLevel(lastFresh: number | null, now: number): StaleLevel {
  if (lastFresh === null) return 'red';
  const age = now - lastFresh;
  if (age >= RED_AFTER_MS) return 'red';
  if (age >= AMBER_AFTER_MS) return 'amber';
  return 'ok';
}
