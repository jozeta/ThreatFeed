import { CveIntel, KevEntry } from '../../types';
import { TvTile } from './tiles';

/** Breaking news on the TV wall: stories that arrive while the wall runs and jump the queue with a NEW badge. */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const timeOf = (s: string | undefined) => (s ? new Date(s).getTime() : NaN);

/** CVE → KEV dateAdded (YYYY-MM-DD), from the KEV catalog and per-CVE intel. */
export function kevAddedMap(
  vulns: { kev: Pick<KevEntry, 'cve' | 'dateAdded'>[] } | null | undefined,
  cveIntel: Record<string, CveIntel> | null | undefined
): Map<string, string> {
  const out = new Map<string, string>();
  for (const k of vulns?.kev ?? []) if (k.dateAdded) out.set(k.cve, k.dateAdded);
  for (const [cve, intel] of Object.entries(cveIntel ?? {})) if (intel.kevDateAdded && !out.has(cve)) out.set(cve, intel.kevDateAdded);
  return out;
}

/**
 * Tiles that are breaking: not in `seen`, never victims, less than an hour old, and critical or about a CVE added to KEV
 * within 24 hours. A KEV tile's time is only the day it was added, so for it that day being within 24 hours counts as
 * fresh. Newest first.
 */
export function findBreaking(tiles: TvTile[], seen: Set<string>, kevAdded: Map<string, string>, now: number): TvTile[] {
  const newKev = (cve: string) => {
    const t = timeOf(kevAdded.get(cve));
    return Number.isFinite(t) && now - t < DAY_MS;
  };
  return tiles
    .filter(t => {
      if (seen.has(t.id) || t.kind === 'victim') return false;
      const time = timeOf(t.time);
      if (!Number.isFinite(time) || now - time >= (t.kind === 'kev' ? DAY_MS : HOUR_MS)) return false;
      return !!t.critical || (t.cves ?? []).some(newKev);
    })
    .sort((a, b) => timeOf(b.time) - timeOf(a.time));
}
