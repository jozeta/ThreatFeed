import type { BarBucket, BarSegment } from '../../components/charts/StackedBars';
import { bucketize, foldSlices, type Slice } from '../../components/charts/chartData';
import { SEVERITY_DOT } from '../../components/charts/shared';
import type { Article, CveRecord, Feed, KevEntry, LeakSiteVictim } from '../../types';
import { groupDisplayName } from '../../utils/countries';
import { localDayKey } from '../../utils/date';
import { countEntitiesByDay, trendsVocab } from '../intelligence/trends';
import { cvssBand } from '../intelligence/vulns';
import type { NpmAdvisory, NpmAdvisoryData, NpmMalwareData } from '../npm/advisories';
import type { PackageResult } from '../npm/match';
import { shortCwe } from '../tv/dashboard';

/**
 * Chart-ready data for the stats panels. Pure: nothing here reads the clock or changes its inputs. A window of
 * `days` is the viewer's local calendar days ending with the day of `now` (today included), and withdrawn npm
 * advisories never count.
 */

export type Row = { label: string; value: number };

const TOP_ROWS = 8;
const OTHER_FILL = 'fill-slate-400';
// Fills for the non-severity stacks (CWE families, ransomware groups), in rank order
const STACK_FILLS = ['fill-rose-500', 'fill-orange-500', 'fill-amber-500', 'fill-emerald-500', 'fill-sky-500'];

/** Local day keys, oldest first, ending with the day of `now` */
function dayKeys(now: number, days: number): string[] {
  const end = new Date(now);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(localDayKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() - i, 12)));
  return keys;
}

const dayOf = (iso: string | undefined): string | undefined => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? undefined : localDayKey(t);
};

/** The items whose date falls in the window, with their local day */
function inWindow<T>(items: T[], date: (item: T) => string | undefined, now: number, days: number): { item: T; day: string }[] {
  const keys = new Set(dayKeys(now, days));
  const out: { item: T; day: string }[] = [];
  for (const item of items) {
    const day = dayOf(date(item));
    if (day && keys.has(day)) out.push({ item, day });
  }
  return out;
}

function tally(labels: Iterable<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1);
  return m;
}

const ranked = (m: Map<string, number>): Row[] =>
  [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

const slices = (m: Map<string, number>, max?: number) => foldSlices(ranked(m), max);

/** One stacked bar per day with the same segments in each, in the order given */
function stackByDay(now: number, days: number, segments: { name: string; className: string }[], counts: Map<string, Map<string, number>>): BarBucket[] {
  return dayKeys(now, days).map((key) => ({
    label: key,
    short: key.slice(5),
    segments: segments.map((s): BarSegment => ({ ...s, value: counts.get(key)?.get(s.name) ?? 0 })),
  }));
}

function countByDay(entries: { day: string; name: string }[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const { day, name } of entries) {
    const d = out.get(day) ?? out.set(day, new Map()).get(day)!;
    d.set(name, (d.get(name) ?? 0) + 1);
  }
  return out;
}

/** Top `top` names by total count (ties alphabetical), the rest folded into "Other" (only listed when something folds) */
function topSegments(totals: Map<string, number>, top: number): { names: Set<string>; segments: { name: string; className: string }[] } {
  const order = ranked(totals);
  const kept = order.slice(0, top);
  const segments = kept.map((r, i) => ({ name: r.label, className: STACK_FILLS[i % STACK_FILLS.length] }));
  if (order.length > top) segments.push({ name: 'Other', className: OTHER_FILL });
  return { names: new Set(kept.map((r) => r.label)), segments };
}

// ---- Vulnerabilities ----

export function kevByVendor(kev: KevEntry[], now: number, days = 90): Slice[] {
  return slices(tally(inWindow(kev, (k) => k.dateAdded, now, days).map(({ item }) => item.vendor.trim() || 'Unknown')));
}

const CVSS_ROWS = [
  { id: 'critical', label: '9–10' },
  { id: 'high', label: '7–8.9' },
  { id: 'medium', label: '4–6.9' },
  { id: 'low', label: '0.1–3.9' },
] as const;

/** New CVEs per CVSS band, highest first; unscored CVEs are left out */
export function cvssBands(cves: CveRecord[], now: number, days = 30): Row[] {
  const counts = tally(inWindow(cves, (c) => c.published, now, days).map(({ item }) => cvssBand(item.score)));
  return CVSS_ROWS.map((r) => ({ label: r.label, value: counts.get(r.id) ?? 0 }));
}

/** KEV entries by EPSS score (those with one) */
export function epssHistogram(kev: KevEntry[]) {
  return bucketize(kev.flatMap((k) => (typeof k.epss === 'number' ? [k.epss] : [])), [0, 0.01, 0.05, 0.1, 0.3, 0.5, 0.7, 1]);
}

const cweFamily = (cwe: string | undefined) => (cwe && !/^NVD-CWE-/.test(cwe) ? shortCwe(cwe) : 'No CWE');

/** Critical CVEs (CVSS 9+) published per day, stacked by the 4 most common CWE families */
export function criticalPerDayByCweFamily(notable: CveRecord[], now: number, days = 30): BarBucket[] {
  const critical = inWindow(notable, (c) => c.published, now, days).filter(({ item }) => cvssBand(item.score) === 'critical' || item.severity === 'CRITICAL');
  const families = critical.map(({ item, day }) => ({ day, name: cweFamily(item.cwe) }));
  const { names, segments } = topSegments(tally(families.map((f) => f.name)), 4);
  return stackByDay(now, days, segments, countByDay(families.map((f) => ({ day: f.day, name: names.has(f.name) ? f.name : 'Other' }))));
}

// ---- Ransomware ----

export function victimsBySector(victims: LeakSiteVictim[], now: number, days = 30): Slice[] {
  return slices(tally(inWindow(victims, (v) => v.discoveredAt, now, days).map(({ item }) => item.sector?.trim() || 'Unknown')));
}

const groupName = (v: LeakSiteVictim) => groupDisplayName(v.group.trim() || 'unknown');

export function groupShare(victims: LeakSiteVictim[], now: number, days = 30): Slice[] {
  return slices(tally(inWindow(victims, (v) => v.discoveredAt, now, days).map(({ item }) => groupName(item))));
}

export function victimsPerDayTopGroups(victims: LeakSiteVictim[], now: number, days = 30, top = 5): BarBucket[] {
  const entries = inWindow(victims, (v) => v.discoveredAt, now, days).map(({ item, day }) => ({ day, name: groupName(item) }));
  const { names, segments } = topSegments(tally(entries.map((e) => e.name)), top);
  return stackByDay(now, days, segments, countByDay(entries.map((e) => ({ day: e.day, name: names.has(e.name) ? e.name : 'Other' }))));
}

// ---- News ----

export function storiesByCategory(articles: Article[], feeds: Feed[], now: number, days = 7): Slice[] {
  const categoryOf = new Map(feeds.map((f) => [f.id, f.category]));
  return slices(tally(inWindow(articles, (a) => a.publishedAt, now, days).map(({ item }) => categoryOf.get(item.sourceId) || item.categories?.[0] || 'Uncategorized')));
}

const NEWS_SEVERITIES = [
  { name: 'Critical', className: SEVERITY_DOT.critical },
  { name: 'High', className: SEVERITY_DOT.high },
  { name: 'Medium', className: SEVERITY_DOT.medium },
  { name: 'Low', className: SEVERITY_DOT.low },
  { name: 'Unrated', className: SEVERITY_DOT.unscored },
];

const severityName = (s: string | undefined) => {
  const hit = NEWS_SEVERITIES.find((x) => x.name.toLowerCase() === s);
  return hit && hit.name !== 'Unrated' ? hit.name : 'Unrated'; // info and missing both count as unrated
};

export function storiesPerDayBySeverity(articles: Article[], now: number, days = 14): BarBucket[] {
  const entries = inWindow(articles, (a) => a.publishedAt, now, days).map(({ item, day }) => ({ day, name: severityName(item.severity) }));
  return stackByDay(now, days, NEWS_SEVERITIES, countByDay(entries));
}

/**
 * Vendors named in the last 7 days of stories, most mentioned first (top 8). `vendors` is the KEV vendor list;
 * matching is the trends vocabulary's (whole words, ambiguous vendor names left out, general tech news counted
 * only when it names a CVE).
 */
export function topVendorsThisWeek(articles: Article[], now: number, vendors: string[]): Row[] {
  const week = inWindow(articles, (a) => a.publishedAt, now, 7).map(({ item }) => item);
  // UTC day buckets of 9 days cover any 7 local days
  const perDay = countEntitiesByDay(week, trendsVocab([], vendors).filter((v) => v.kind === 'vendor'), 9, now);
  const totals = new Map<string, number>();
  for (const counts of Object.values(perDay)) {
    for (const [key, n] of Object.entries(counts)) {
      if (key.startsWith('vendor:')) totals.set(key.slice(7), (totals.get(key.slice(7)) ?? 0) + n);
    }
  }
  return ranked(totals).slice(0, TOP_ROWS);
}

// ---- npm ----

const liveAdvisories = (data: NpmAdvisoryData, now: number, days: number): { item: NpmAdvisory; day: string }[] =>
  inWindow(data.recent.filter((a) => !a.withdrawn), (a) => a.published, now, days);

const NPM_SEVERITIES = [
  { name: 'Critical', className: SEVERITY_DOT.critical },
  { name: 'High', className: SEVERITY_DOT.high },
  { name: 'Medium', className: SEVERITY_DOT.medium },
  { name: 'Low', className: SEVERITY_DOT.low },
  { name: 'Unknown', className: SEVERITY_DOT.unscored },
];
const npmSeverityName = (s: NpmAdvisory['severity']) => s.charAt(0).toUpperCase() + s.slice(1);

export function npmPerDayBySeverity(data: NpmAdvisoryData, now: number, days = 30): BarBucket[] {
  const entries = liveAdvisories(data, now, days).map(({ item, day }) => ({ day, name: npmSeverityName(item.severity) }));
  return stackByDay(now, days, NPM_SEVERITIES, countByDay(entries));
}

export function npmSeverityShare(data: NpmAdvisoryData, now: number, days = 30): Slice[] {
  return slices(tally(liveAdvisories(data, now, days).map(({ item }) => npmSeverityName(item.severity))));
}

/** Malware advisories (distinct GHSA ids; one advisory can cover several packages) by local day */
function malwareDays(malware: NpmMalwareData | null, now: number, days: number): Map<string, Map<string, number>> {
  const seen = new Set<string>();
  const entries: { day: string; name: string }[] = [];
  for (const { item, day } of inWindow(malware?.entries ?? [], (e) => e[3], now, days)) {
    if (seen.has(item[0])) continue;
    seen.add(item[0]);
    entries.push({ day, name: 'Malware' });
  }
  return countByDay(entries);
}

/** Reviewed advisories (published or updated in the window, withdrawn left out) vs. distinct malware advisories */
export function npmVulnVsMalware(data: NpmAdvisoryData, malware: NpmMalwareData | null, now: number, days = 7): Slice[] {
  const keys = new Set(dayKeys(now, days));
  const inRange = (iso: string) => { const d = dayOf(iso); return !!d && keys.has(d); };
  const vulns = data.recent.filter((a) => !a.withdrawn && (inRange(a.published) || inRange(a.updated))).length;
  const mal = [...malwareDays(malware, now, days).values()].reduce((n, d) => n + (d.get('Malware') ?? 0), 0);
  return foldSlices([{ label: 'Vulnerabilities', value: vulns }, { label: 'Malware', value: mal }]);
}

/** Packages with the most advisories */
export function npmTopPackages(data: NpmAdvisoryData, now: number, days = 30): Row[] {
  const names: string[] = [];
  for (const { item } of liveAdvisories(data, now, days)) names.push(...new Set(item.ranges.map((r) => r.package)));
  return ranked(tally(names)).slice(0, TOP_ROWS);
}

export function npmTopCwes(data: NpmAdvisoryData, now: number, days = 30): Row[] {
  const names: string[] = [];
  for (const { item } of liveAdvisories(data, now, days)) {
    const byId = new Map(item.cwes.map((c) => [c.id, shortCwe(c.id, c.name)]));
    names.push(...byId.values());
  }
  return ranked(tally(names)).slice(0, TOP_ROWS);
}

/** Advisories with a patched version for every affected range vs. those where some range has none */
export function npmFixShare(data: NpmAdvisoryData, now: number, days = 30): Slice[] {
  const fixed = (a: NpmAdvisory) => a.ranges.length > 0 && a.ranges.every((r) => !!r.patched);
  return slices(tally(liveAdvisories(data, now, days).map(({ item }) => (fixed(item) ? 'Fix available' : 'No fix'))));
}

const STATUS_LABEL: Record<PackageResult['status'], string> = {
  affected: 'Affected', 'not-affected': 'Clean', 'no-version': 'No version', unknown: 'Unknown',
};

export function myPackagesStatus(results: PackageResult[]): Slice[] {
  return slices(tally(results.map((r) => STATUS_LABEL[r.status])));
}

/** The most recently published critical advisory, or null */
export function newestCriticalNpm(data: NpmAdvisoryData): NpmAdvisory | null {
  let best: NpmAdvisory | null = null;
  for (const a of data.recent) {
    if (a.withdrawn || a.severity !== 'critical') continue;
    if (!best || a.published > best.published) best = a;
  }
  return best;
}

/** Malware advisories per day, oldest first (for the sparkline) */
export function malwarePerDay(malware: NpmMalwareData | null, now: number, days = 7): number[] {
  const counts = malwareDays(malware, now, days);
  return dayKeys(now, days).map((k) => counts.get(k)?.get('Malware') ?? 0);
}
