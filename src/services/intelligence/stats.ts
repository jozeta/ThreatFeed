import { CveRecord, ExploitInfo, KevEntry, LeakSiteVictim, StatsData, StatsDay } from '../../types';

/**
 * The daily-count history (data/stats.json) the dashboards chart: per UTC day, which critical and high CVEs
 * were published, which were added to KEV, which got a public exploit, and which leak-site victims appeared
 * (with tallies by group, country and sector). Days keep id lists, so merging a run into the history is a set
 * union and recounting a day never inflates it.
 */

export const STATS_KEEP_DAYS = 400;

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LISTS = ['crit', 'high', 'kev', 'exploits', 'victims'] as const;
const MAPS = ['groups', 'countries', 'sectors'] as const;

const emptyDay = (): StatsDay => ({ crit: [], high: [], kev: [], exploits: [], victims: [], groups: {}, countries: {}, sectors: {} });
const dayOf = (iso: string) => {
  const t = Date.parse(iso);
  return isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
};
const hasExploit = (e?: ExploitInfo) => Boolean(e && (e.msf?.length || e.nuclei || (e.pocs ?? 0) > 0));

/**
 * One StatsDay per UTC day that has anything to count, within `keepDays` of `now`. KEV covers years, so its
 * additions back-fill the whole window. An exploit counts on its CVE's published day (a notable CVE) or else
 * its KEV date; CVEs with neither date are skipped. A CVE is in each list once.
 */
export function countStatsByDay(
  input: { notable: CveRecord[]; kev: KevEntry[]; exploits: Record<string, ExploitInfo>; victims: LeakSiteVictim[] },
  now: number,
  keepDays = STATS_KEEP_DAYS
): Record<string, StatsDay> {
  const oldest = new Date(now - (keepDays - 1) * DAY_MS).toISOString().slice(0, 10);
  const newest = new Date(now).toISOString().slice(0, 10);
  const days: Record<string, StatsDay> = {};
  const day = (key: string) => (key >= oldest && key <= newest ? (days[key] ??= emptyDay()) : undefined);
  const add = (key: string, list: (typeof LISTS)[number], id: string) => {
    const d = day(key);
    if (d && !d[list].includes(id)) d[list].push(id);
  };

  const exploitDay = new Map<string, string>();
  for (const r of input.notable) {
    const key = dayOf(r.published);
    if (!key) continue;
    const score = r.score ?? 0;
    if (r.severity === 'CRITICAL' || score >= 9) add(key, 'crit', r.id);
    else if (r.severity === 'HIGH' || score >= 7) add(key, 'high', r.id);
    exploitDay.set(r.id, key);
  }
  for (const k of input.kev) {
    const key = dayOf(k.dateAdded);
    if (!key) continue;
    add(key, 'kev', k.cve);
    if (!exploitDay.has(k.cve)) exploitDay.set(k.cve, key);
  }
  for (const [id, info] of Object.entries(input.exploits)) {
    const key = exploitDay.get(id);
    if (key && hasExploit(info)) add(key, 'exploits', id);
  }
  for (const v of input.victims) {
    const key = dayOf(v.discoveredAt);
    const d = key ? day(key) : undefined;
    if (!d || d.victims.includes(v.id)) continue;
    d.victims.push(v.id);
    const tally = (map: Record<string, number>, name?: string) => { if (name) map[name] = (map[name] ?? 0) + 1; };
    tally(d.groups, v.group);
    tally(d.countries, v.country);
    tally(d.sectors, v.sector);
  }
  return days;
}

/**
 * The next stats.json history: the previous file's days with the recounted ones merged in, days older than
 * `keepDays` dropped. Ids are unioned. The recent victim list covers only about 30 days, so for a day it
 * only partly sees, the tallies keep the larger count per key of the two rather than replacing the
 * previous ones.
 */
export function mergeStats(previous: StatsData | null, recent: Record<string, StatsDay>, now: number, keepDays = STATS_KEEP_DAYS): Record<string, StatsDay> {
  const oldest = new Date(now - (keepDays - 1) * DAY_MS).toISOString().slice(0, 10);
  const merged: Record<string, StatsDay> = {};
  const copy = (d: StatsDay): StatsDay => ({
    ...Object.fromEntries(LISTS.map(l => [l, [...d[l]]])),
    ...Object.fromEntries(MAPS.map(m => [m, { ...d[m] }])),
  } as unknown as StatsDay);
  for (const [key, d] of Object.entries(previous?.days ?? {})) if (key >= oldest) merged[key] = copy(d);
  for (const [key, d] of Object.entries(recent)) {
    if (key < oldest) continue;
    const day = (merged[key] ??= emptyDay());
    for (const l of LISTS) day[l] = [...new Set([...day[l], ...d[l]])];
    for (const m of MAPS) for (const [name, n] of Object.entries(d[m])) day[m][name] = Math.max(n, day[m][name] ?? 0);
  }
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
}

const isMap = (x: any) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);

/** Validates stats.json (the app's load and the snapshot's carry-over): days with malformed lists are dropped */
export function decodeStats(raw: any): StatsData | null {
  if (!raw || raw.version !== 1 || !isMap(raw.days)) return null;
  const days: Record<string, StatsDay> = {};
  for (const [key, d] of Object.entries<any>(raw.days)) {
    if (!DAY_RE.test(key) || !isMap(d)) continue;
    if (!LISTS.every(l => Array.isArray(d[l]) && d[l].every((x: unknown) => typeof x === 'string'))) continue;
    const day = emptyDay();
    for (const l of LISTS) day[l] = d[l];
    for (const m of MAPS) {
      if (!isMap(d[m])) continue;
      for (const [name, n] of Object.entries(d[m])) if (Number.isInteger(n) && (n as number) > 0) day[m][name] = n as number;
    }
    days[key] = day;
  }
  return { version: 1, generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : '', days };
}

export function dayTotals(day: StatsDay): { crit: number; high: number; kev: number; exploits: number; victims: number } {
  return { crit: day.crit.length, high: day.high.length, kev: day.kev.length, exploits: day.exploits.length, victims: day.victims.length };
}
