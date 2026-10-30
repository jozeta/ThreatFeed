import { Article, TrendDays, TrendsData } from '../../types';
import { groupDisplayName } from '../../utils/countries';
import { articleMentions, EntityKind, presetTerms } from './trending';

/**
 * The trends history (data/trends.json): per UTC day, how many articles mentioned each CVE, ransomware
 * group, threat actor, product and vendor. The snapshot recounts the last few days every run; after 60 days
 * the days are summed into Monday-to-Sunday weeks, kept for two years. The Trends page ranks entities over a
 * week, month or year from it.
 */

export type TrendKind = EntityKind | 'vendor';
export type TrendVocab = { kind: TrendKind; terms: string[] }[];
export type TrendPeriod = 'week' | 'month' | 'year';

export const TREND_KINDS: TrendKind[] = ['cve', 'ransomware', 'actor', 'product', 'vendor'];
// Two years, so the year can be compared with the one before
export const TREND_KEEP_DAYS = 730;
export const TREND_RECOUNT_DAYS = 3;
// Days older than this are summed into their week: the month and the month before it stay daily, and the
// year view only needs weeks
export const TREND_DAILY_DAYS = 60;
export const PERIOD_DAYS: Record<TrendPeriod, number> = { week: 7, month: 30, year: 365 };
const YEAR_WEEKS = 52;

export interface TrendRow {
  key: string; // `${kind}:${name}`, as in trends.json
  kind: TrendKind;
  name: string;
  count: number; // articles in the period
  previous: number | null; // articles in the period before it; null when the history doesn't reach back that far
  change: number | null;
  series: number[]; // oldest first: per day for a week or month, per week for a year
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^(cve|ransomware|actor|product|vendor):./;

const dayNumber = (t: number) => Math.floor(t / DAY_MS);
const dayKeyOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const dayNumberOf = (key: string) => dayNumber(Date.parse(`${key}T00:00:00Z`));
// The Monday a day's week starts on (day 0, 1970-01-01, was a Thursday)
const weekStart = (day: number) => day - ((day + 3) % 7);

// KEV vendors whose names are everyday words: they would count every "progress" and "quest"
const AMBIGUOUS_VENDORS = new Set([
  'progress', 'arm', 'nice', 'daemon', 'checkbox', 'quest', 'meta', 'git', 'sudo', 'perl', 'looking glass', 'nx', 'vite',
  'prettier', 'plex', 'ietf', 'isc', 'pear', 'gnu', 'rails', 'elastic', 'widget factory', 'npm package', 'lg', 'php', 'ami',
]);

// Feed categories of general tech and consumer news: Apple fan sites would otherwise make Apple the top vendor
const GENERAL_CATEGORIES = new Set(['General Tech', 'Consumer Tech', 'Tech Guides & How-To', 'Platform Ecosystems', 'Swedish (Feber)']);

function uniqueTerms(terms: string[]): string[] {
  const seen = new Map<string, string>();
  for (const t of terms) if (t.trim() && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()];
}

/**
 * The vocabulary trending uses (ransomware presets plus the groups posting on leak sites, the APT preset,
 * the frequently exploited products) with KEV vendors added. A vendor name in the products preset counts
 * as the vendor only, so Fortinet isn't listed twice; ambiguous vendor names are left out.
 */
export function trendsVocab(victimGroups: string[], kevVendors: string[]): TrendVocab {
  const vendors = uniqueTerms(kevVendors).filter(v => v.length >= 2 && !AMBIGUOUS_VENDORS.has(v.toLowerCase()));
  const vendorKeys = new Set(vendors.map(v => v.toLowerCase()));
  return [
    { kind: 'ransomware', terms: uniqueTerms([...presetTerms('ransomware').filter(t => /^[A-Z]/.test(t)), ...victimGroups.map(groupDisplayName)]) },
    { kind: 'actor', terms: uniqueTerms(presetTerms('apt')) },
    { kind: 'product', terms: uniqueTerms(presetTerms('edge-devices')).filter(p => !vendorKeys.has(p.toLowerCase())) },
    { kind: 'vendor', terms: vendors },
  ];
}

/** Adds one article's mentions to its day (articles outside `days` are skipped) */
function countInto(days: TrendDays, a: Article, vocab: TrendVocab) {
  const t = new Date(a.publishedAt).getTime();
  if (isNaN(t)) return;
  const day = days[dayKeyOf(dayNumber(t))];
  if (!day) return;
  // News coverage only: leak-site posts are the Ransomware page's activity data, and would swamp the groups
  // Vendors count in security coverage: general tech news only when it names a CVE
  const vendors = !GENERAL_CATEGORIES.has(a.categories?.[0]) || Boolean(a.cves?.length);
  const keys = new Set(articleMentions(a, vocab, false).filter(m => vendors || m.kind !== 'vendor').map(m => `${m.kind}:${m.name}`));
  for (const key of keys) day[key] = (day[key] ?? 0) + 1;
}

/**
 * Distinct articles mentioning each entity, per UTC day, over the last `days` days up to `now`. Every day in
 * the range is present (possibly empty), so a recount replaces it whole.
 */
export function countEntitiesByDay(articles: Article[], vocab: TrendVocab, days: number, now = Date.now()): TrendDays {
  const today = dayNumber(now);
  const result: TrendDays = {};
  for (let d = today - days + 1; d <= today; d++) result[dayKeyOf(d)] = {};
  for (const a of articles) countInto(result, a, vocab);
  return result;
}

/**
 * The next trends.json history: the previous file's, with the recounted days merged in, days older than
 * TREND_DAILY_DAYS added to their week's sums and weeks that ended more than `keepDays` ago dropped. A
 * recounted day keeps the larger count per entity: the snapshot holds the latest 25 articles per feed, so a
 * busy feed's older articles drop out of it while their day is still recounted.
 *
 * Once a week is complete, CVEs named in only one article that week are dropped from it. They are nearly
 * nine in ten of its entries (advisory feeds list many CVEs once) and the year's top CVEs have dozens of
 * mentions; without this two years would be about 2.2 MB, with it about 0.8 MB. Other kinds stay exact.
 */
export function mergeTrends(previous: TrendsData | null, recent: TrendDays, now = Date.now(), keepDays = TREND_KEEP_DAYS): Required<Pick<TrendsData, 'days' | 'weeks'>> {
  const today = dayNumber(now);
  const days: TrendDays = {};
  const weeks: TrendDays = {};
  for (const [key, counts] of Object.entries(previous?.weeks ?? {})) weeks[dayKeyOf(weekStart(dayNumberOf(key)))] = { ...counts };
  for (const [key, counts] of Object.entries(previous?.days ?? {})) {
    const day = dayNumberOf(key);
    if (today - day < TREND_DAILY_DAYS) {
      days[key] = counts;
      continue;
    }
    // Each day is rolled up once: it leaves `days` as it goes into its week
    const week = (weeks[dayKeyOf(weekStart(day))] ??= {});
    for (const [entity, n] of Object.entries(counts)) week[entity] = (week[entity] ?? 0) + n;
  }
  for (const [key, counts] of Object.entries(recent)) {
    const merged = { ...days[key] };
    for (const [entity, n] of Object.entries(counts)) merged[entity] = Math.max(n, merged[entity] ?? 0);
    days[key] = merged;
  }
  for (const [key, counts] of Object.entries(weeks)) {
    if (today - (dayNumberOf(key) + 6) < TREND_DAILY_DAYS) continue; // days of it are still daily
    for (const [entity, n] of Object.entries(counts)) if (n === 1 && entity.startsWith('cve:')) delete counts[entity];
  }
  const oldest = today - keepDays + 1;
  const sorted = (map: TrendDays) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  return {
    days: sorted(days),
    weeks: sorted(Object.fromEntries(Object.entries(weeks).filter(([key]) => dayNumberOf(key) + 6 >= oldest))),
  };
}

/**
 * Which history this run builds on: the newer of the Action cache's copy and the published file. With
 * neither, a read failure (anything but a 404) means the history exists but couldn't be read: nothing may
 * be written then, or the next deploy would replace it with a few days.
 */
export function pickPreviousTrends(
  cached: TrendsData | null,
  published: { data: TrendsData | null; error?: string }
): { base: TrendsData | null; write: boolean; source: 'cache' | 'published' | 'none' } {
  const p = published.data;
  if (cached && (!p || (cached.generatedAt ?? '') > (p.generatedAt ?? ''))) return { base: cached, write: true, source: 'cache' };
  if (p) return { base: p, write: true, source: 'published' };
  return { base: null, write: !published.error, source: 'none' };
}

/** The first day the history has (YYYY-MM-DD; a week counts from its Monday) */
export function historyStart(history: Pick<TrendsData, 'days' | 'weeks'>): string | undefined {
  return [...Object.keys(history.days), ...Object.keys(history.weeks ?? {})].reduce<string | undefined>((min, d) => (!min || d < min ? d : min), undefined);
}

/**
 * The week's days for the Trends page: the history, plus this browser's articles where the history can't
 * know them. Days the history lacks are counted from local articles; on the others, articles from the
 * user's own feeds and those newer than the snapshot are added.
 */
export function weekTrendDays(history: TrendsData | null, articles: Article[], vocab: TrendVocab, customSources: Set<string>, now = Date.now()): TrendDays {
  const today = dayNumber(now);
  const span = PERIOD_DAYS.week * 2; // the week and the one before it
  const since = history?.generatedAt ? Date.parse(history.generatedAt) : -Infinity;
  const recent = articles.filter(a => dayNumber(new Date(a.publishedAt).getTime()) > today - span);
  const firstLocal = recent.reduce((min, a) => Math.min(min, dayNumber(new Date(a.publishedAt).getTime())), today);

  const days: TrendDays = {};
  for (const [key, counts] of Object.entries(history?.days ?? {})) days[key] = { ...counts };
  const missing: TrendDays = {};
  for (let d = Math.max(firstLocal, today - span + 1); d <= today; d++) if (!days[dayKeyOf(d)]) missing[dayKeyOf(d)] = {};
  for (const a of recent) {
    const key = new Date(a.publishedAt).toISOString().slice(0, 10);
    if (missing[key]) countInto(missing, a, vocab);
    else if (customSources.has(a.sourceId) || new Date(a.publishedAt).getTime() > since) countInto(days, a, vocab);
  }
  return { ...days, ...missing };
}

/**
 * Entities ranked by mentions over the period ending today (most first, then the biggest rise), with the
 * change against the period before and a series for a sparkline. A week or month counts days; the year is
 * the last 52 Monday-to-Sunday weeks (this one so far included), from days and weekly sums alike. `kind`
 * 'all' keeps every kind.
 */
export function rankTrends(history: Pick<TrendsData, 'days' | 'weeks'>, period: TrendPeriod, kind: TrendKind | 'all', now = Date.now()): TrendRow[] {
  const today = dayNumber(now);
  const yearly = period === 'year';
  const buckets = yearly ? YEAR_WEEKS : PERIOD_DAYS[period];
  // Position of a day in the series: 0 is the oldest bucket, negative is the previous period
  const thisWeek = weekStart(today);
  const bucketOf = (day: number) => (yearly ? buckets - 1 - (thisWeek - weekStart(day)) / 7 : buckets - 1 - (today - day));
  const start = historyStart(history);
  // The previous period is only comparable when the history covers all of it
  const comparable = start !== undefined && bucketOf(dayNumberOf(start)) <= -buckets;

  const rows = new Map<string, TrendRow>();
  const add = (dayKey: string, counts: Record<string, number>) => {
    const i = bucketOf(dayNumberOf(dayKey));
    if (i >= buckets || i < -buckets) return;
    for (const [key, n] of Object.entries(counts)) {
      const sep = key.indexOf(':');
      const k = key.slice(0, sep) as TrendKind;
      if (kind !== 'all' && k !== kind) continue;
      let row = rows.get(key);
      if (!row) {
        row = { key, kind: k, name: key.slice(sep + 1), count: 0, previous: comparable ? 0 : null, change: null, series: new Array(buckets).fill(0) };
        rows.set(key, row);
      }
      if (i >= 0) {
        row.count += n;
        row.series[i] += n;
      } else if (row.previous !== null) {
        row.previous += n;
      }
    }
  };
  for (const [key, counts] of Object.entries(history.days)) add(key, counts);
  // Weekly sums only reach back past the daily days, which a week or month never does
  if (yearly) for (const [key, counts] of Object.entries(history.weeks ?? {})) add(key, counts);
  return [...rows.values()]
    .filter(r => r.count > 0)
    .map(r => ({ ...r, change: r.previous === null ? null : r.count - r.previous }))
    .sort((a, b) => b.count - a.count || (b.change ?? 0) - (a.change ?? 0) || a.name.localeCompare(b.name));
}

/** The entities whose mentions grew the most against the previous period (at least two mentions now) */
export function risers(rows: TrendRow[], limit: number): TrendRow[] {
  return rows
    .filter(r => r.change !== null && r.change > 0 && r.count >= 2)
    .sort((a, b) => b.change! - a.change! || b.count - a.count)
    .slice(0, limit);
}

/** Validates trends.json (the app's load and the snapshot's carry-over): malformed days and counts are dropped */
export function decodeTrends(raw: any): TrendsData | null {
  const isMap = (x: any) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
  if (!raw || !isMap(raw.days)) return null;
  const clean = (map: any): TrendDays => {
    const out: TrendDays = {};
    for (const [day, counts] of Object.entries<any>(isMap(map) ? map : {})) {
      if (!DAY_RE.test(day) || !isMap(counts)) continue;
      const kept: Record<string, number> = {};
      for (const [key, n] of Object.entries(counts)) if (KEY_RE.test(key) && Number.isInteger(n) && (n as number) > 0) kept[key] = n as number;
      out[day] = kept;
    }
    return out;
  };
  return { generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined, days: clean(raw.days), weeks: clean(raw.weeks) };
}

/** The entity kinds by their trends key prefix, for labels */
export const TREND_KIND_LABELS: Record<TrendKind, string> = { cve: 'CVE', ransomware: 'Ransomware', actor: 'Actor', product: 'Product', vendor: 'Vendor' };
