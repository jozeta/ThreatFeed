import { Article, CveIntel, VulnData } from '../../types';
import { getStoredValue, saveStoredValue } from '../storage/indexeddb';

/** What the app knows about one watched CVE at a point in time */
export interface CveWatchState {
  kev: boolean;
  kevDateAdded?: string;
  epss?: number;
  articleIds: string[];
}

export interface CveChange {
  cve: string;
  kind: 'kev' | 'epss' | 'news';
  text: string;
}

/**
 * Two baselines per CVE: `notified` moves on every check (so a change notifies once), `seen` only when
 * the user marks the Watching tab as seen (so changes stay highlighted until then).
 */
export interface CveWatchStore {
  notified: Record<string, CveWatchState>;
  seen: Record<string, CveWatchState>;
}

const STORE_KEY = 'cveWatch';
export const CVE_WATCH_EVENT = 'threatfeed:cve-watch'; // fired on window when the store changes

// An EPSS move is worth flagging when it rises 10 points, or at least doubles by 2 points or more
const EPSS_ABSOLUTE_JUMP = 0.1;
const EPSS_MIN_RELATIVE_JUMP = 0.02;

const pct = (p: number) => `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%`;

export function diffCveWatch(cve: string, before: CveWatchState | undefined, now: CveWatchState): CveChange[] {
  if (!before) return []; // first sighting is the baseline
  const changes: CveChange[] = [];
  if (now.kev && !before.kev) changes.push({ cve, kind: 'kev', text: `added to CISA KEV${now.kevDateAdded ? ` on ${now.kevDateAdded}` : ''}` });
  if (before.epss !== undefined && now.epss !== undefined) {
    const rise = now.epss - before.epss;
    if (rise >= EPSS_ABSOLUTE_JUMP || (now.epss >= 2 * before.epss && rise >= EPSS_MIN_RELATIVE_JUMP)) {
      changes.push({ cve, kind: 'epss', text: `EPSS rose from ${pct(before.epss)} to ${pct(now.epss)}` });
    }
  }
  const known = new Set(before.articleIds);
  const fresh = now.articleIds.filter((id) => !known.has(id)).length;
  if (fresh > 0) changes.push({ cve, kind: 'news', text: `${fresh} new article${fresh === 1 ? '' : 's'}` });
  return changes;
}

export function buildWatchState(
  cve: string,
  vulns: VulnData | null,
  cveIntel: Record<string, CveIntel>,
  articles: Article[],
  epss: Map<string, number>
): CveWatchState {
  const kev = vulns?.kev.find((k) => k.cve === cve);
  const intel = cveIntel[cve];
  return {
    kev: Boolean(kev || intel?.kev),
    kevDateAdded: kev?.dateAdded ?? intel?.kevDateAdded,
    epss: epss.get(cve) ?? kev?.epss ?? intel?.epss,
    articleIds: articles.filter((a) => a.cves?.includes(cve)).map((a) => a.id),
  };
}

export async function loadWatchStore(): Promise<CveWatchStore> {
  const stored = await getStoredValue<CveWatchStore>(STORE_KEY);
  return { notified: stored?.notified ?? {}, seen: stored?.seen ?? {} };
}

export async function saveWatchStore(store: CveWatchStore): Promise<void> {
  await saveStoredValue(STORE_KEY, store);
  window.dispatchEvent(new Event(CVE_WATCH_EVENT));
}

// Current EPSS straight from FIRST (it allows browser requests), so any watched CVE has one, not only
// the ones in the snapshot. Cached for half an hour: scores change once a day.
const EPSS_TTL_MS = 30 * 60 * 1000;
const epssCache = new Map<string, { value: number | undefined; at: number }>();

export async function fetchEpssScores(cves: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const stale: string[] = [];
  for (const cve of cves) {
    const hit = epssCache.get(cve);
    if (hit && Date.now() - hit.at < EPSS_TTL_MS) {
      if (hit.value !== undefined) result.set(cve, hit.value);
    } else stale.push(cve);
  }
  for (let i = 0; i < stale.length; i += 100) {
    const batch = stale.slice(i, i + 100);
    try {
      const res = await fetch(`https://api.first.org/data/v1/epss?cve=${batch.map(encodeURIComponent).join(',')}`);
      if (!res.ok) continue;
      const rows: any[] = (await res.json())?.data ?? [];
      const found = new Map(rows.map((r) => [String(r.cve).toUpperCase(), Number(r.epss)]));
      for (const cve of batch) {
        const value = found.get(cve);
        epssCache.set(cve, { value: value !== undefined && !isNaN(value) ? value : undefined, at: Date.now() });
        if (value !== undefined && !isNaN(value)) result.set(cve, value);
      }
    } catch {
      // Offline or rate limited: fall back to the snapshot's EPSS values
    }
  }
  return result;
}

export const isCveId = (value: string) => /^CVE-\d{4}-\d{4,}$/.test(value);
