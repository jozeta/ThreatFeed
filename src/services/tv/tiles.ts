import { Article, LeakSiteVictim } from '../../types';
import { Briefing } from '../intelligence/briefing';
import { classifyIncident, isLeakSitePost } from '../intelligence/incidents';
import { clusterArticles } from '../articles/clustering';
import { calculateImportance } from '../articles/importance';
import { countryName } from '../../utils/countries';
import { EngineItem, Shape } from './tileEngine';
import type { NpmAdvisory, NpmAdvisoryData, NpmMalwareData } from '../npm/advisories';
import type { PackageResult } from '../npm/match';
import { formatPackageEntry } from '../npm/semver';

export type TvTileKind = 'story' | 'victim' | 'kev' | 'breach' | 'trend' | 'npm';
export type TvTone = 'critical' | 'high' | 'info' | 'ransomware';

export interface TvTile {
  id: string;
  kind: TvTileKind;
  tone: TvTone;
  source: string;
  time?: string; // ISO
  headline: string;
  summary?: string;
  weight: number;
  /** CVEs the tile is about (breaking news: newly added to KEV) */
  cves?: string[];
  /** Critical severity (breaking news) */
  critical?: boolean;
  /** Article link; for an npm advisory its GitHub page (the QR code's target) */
  url?: string;
  /** An npm advisory's details (kind 'npm'): all plain text, rendered as text */
  npm?: NpmTileInfo;
}

export interface NpmTileInfo {
  severity: NpmAdvisory['severity'] | 'malware';
  /** The packages it lists, a watched one first */
  packages: string[];
  /** The first package's affected range and first fixed version */
  vulnerable: string;
  patched?: string;
  /** GHSA id, then CVE ids */
  ids: string[];
  /** The watched entries (name@version) it affects; empty when none */
  yours: string[];
}

const HOUR_MS = 60 * 60 * 1000;

/** Plain text from feed HTML: tags dropped, common entities decoded, whitespace collapsed */
function plainText(html?: string): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|tr|td)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}

const timeOf = (iso: string) => new Date(iso).getTime() || 0;

function storyTile(a: Article, weight: number): TvTile {
  const tone: TvTone =
    a.severity === 'critical' ? 'critical' : a.severity === 'high' ? 'high' : a.tags.some(t => t.toLowerCase() === 'ransomware') ? 'ransomware' : 'info';
  return {
    id: a.id,
    kind: 'story',
    tone,
    source: a.sourceName,
    time: a.publishedAt,
    headline: a.title,
    summary: plainText(a.description),
    weight,
    cves: a.cves,
    critical: a.severity === 'critical',
    url: a.url,
  };
}

/** Front page: the last 24h, widened to 72h and then 7 days while fewer than 5 stories qualify; clustered, leak-site posts removed, most important first */
export function tilesForFront(articles: Article[], stackKeywords: string[], now: number, max = 30): TvTile[] {
  const notLeak = articles.filter(a => !isLeakSitePost(a));
  let recent: Article[] = [];
  for (const hours of [24, 72, 168]) {
    recent = notLeak.filter(a => now - timeOf(a.publishedAt) <= hours * HOUR_MS);
    if (clusterArticles(recent).length >= 5) break;
  }
  return clusterArticles(recent)
    .map(c => c.primaryArticle)
    .map(a => ({ a, importance: calculateImportance(a, stackKeywords), time: timeOf(a.publishedAt) }))
    .sort((x, y) => y.importance - x.importance || y.time - x.time)
    .slice(0, max)
    .map(({ a, importance }) => storyTile(a, importance));
}

export function tilesForBriefing(b: Briefing, max = 30): TvTile[] {
  const tiles: TvTile[] = [];

  for (const s of b.topStories) tiles.push(storyTile(s.cluster.primaryArticle, 10));

  for (const k of b.newKev) {
    tiles.push({
      id: `kev-${k.cve}`,
      kind: 'kev',
      tone: 'critical',
      source: 'CISA KEV',
      time: k.intel.kevDateAdded,
      headline: `${k.cve} added to CISA KEV`,
      summary: k.intel.kevName,
      weight: 9,
      cves: [k.cve],
      critical: false,
    });
  }

  if (b.ransomware.count > 0) {
    const top = b.ransomware.byGroup.slice(0, 3).map(([g, n]) => `${g} (${n})`).join(', ');
    tiles.push({
      id: 'briefing-ransomware',
      kind: 'victim',
      tone: 'ransomware',
      source: 'Ransomware leak sites',
      headline: `${b.ransomware.count} ransomware victims`,
      summary: top || undefined,
      weight: 8,
    });
  }

  for (const br of b.breaches) {
    tiles.push({
      id: `breach-${br.name}`,
      kind: 'breach',
      tone: 'high',
      source: 'Have I Been Pwned',
      time: br.addedAt,
      headline: `${br.title} breach`,
      summary: plainText(br.description) ?? `${br.records.toLocaleString('en-US')} records exposed`,
      weight: 6,
    });
  }

  for (const t of b.trending) {
    tiles.push({
      id: `trend-${t.kind}-${t.name}`,
      kind: 'trend',
      tone: 'info',
      source: 'Trending',
      headline: t.name,
      summary: t.previous > 0 && t.count !== t.previous ? `${t.count} articles, ${t.count > t.previous ? 'up' : 'down'} from ${t.previous}` : `${t.count} articles`,
      weight: 4,
    });
  }

  return tiles.slice(0, max);
}

function victimTile(v: LeakSiteVictim): TvTile {
  const summary = [v.sector, v.country ? countryName(v.country) : undefined].filter(Boolean).join(' · ');
  return {
    id: `victim-${v.id}`,
    kind: 'victim',
    tone: 'ransomware',
    source: 'Ransomware leak site',
    time: v.discoveredAt,
    headline: `${v.group} listed ${v.victim}`,
    summary: summary || undefined,
    weight: 5,
  };
}

/** Ransomware news with a fresh leak-site victim woven in as every third tile */
export function tilesForRansomware(news: Article[], victims: LeakSiteVictim[], groupNames: string[], now: number, max = 30): TvTile[] {
  const stories = news
    .filter(a => !isLeakSitePost(a) && now - timeOf(a.publishedAt) <= 72 * HOUR_MS && classifyIncident(a, groupNames) === 'ransomware')
    .sort((a, b) => timeOf(b.publishedAt) - timeOf(a.publishedAt))
    .map(a => storyTile(a, calculateImportance(a)));

  const newestFirst = [...victims].sort((a, b) => timeOf(b.discoveredAt) - timeOf(a.discoveredAt));
  const day = newestFirst.filter(v => now - timeOf(v.discoveredAt) <= 24 * HOUR_MS);
  const pool = day.length > 0 ? day : newestFirst.filter(v => now - timeOf(v.discoveredAt) <= 72 * HOUR_MS);
  const vTiles = pool.map(victimTile);

  const out: TvTile[] = [];
  let s = 0;
  let v = 0;
  while (s < stories.length || v < vTiles.length) {
    const wantVictim = (out.length + 1) % 3 === 0;
    if ((wantVictim && v < vTiles.length) || s >= stories.length) out.push(vTiles[v++]);
    else out.push(stories[s++]);
  }
  return out.slice(0, max);
}

// npm advisories (the npm wall, and mixed mode). "Affecting" means a watched entry with a version inside a range (or a
// range that can't be read, which matching flags rather than clears); an entry without a version only lists the
// package's advisories, so it doesn't count.

const DAY_MS = 24 * HOUR_MS;
const GHSA_ID = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/i;

/** The GitHub advisory page for a GHSA id; undefined (no QR code) when the id isn't a well-formed GHSA id */
export function ghsaUrl(id: string): string | undefined {
  return GHSA_ID.test(id) ? `https://github.com/advisories/${id}` : undefined;
}

interface Hit { name: string; label: string; vulnerable: string; patched?: string }

/** Advisory id → the watched, versioned entries it affects */
function watchedHits(results: PackageResult[]): Map<string, Hit[]> {
  const map = new Map<string, Hit[]>();
  for (const r of results) {
    if (!r.entry.version) continue;
    for (const a of r.advisories) {
      const hit: Hit = { name: r.entry.name, label: formatPackageEntry(r.entry), vulnerable: a.vulnerable, patched: a.patched };
      const list = map.get(a.id);
      if (list) list.push(hit);
      else map.set(a.id, [hit]);
    }
  }
  return map;
}

const NPM_WEIGHT: Record<NpmTileInfo['severity'], number> = { malware: 10, critical: 8, high: 6, medium: 4, low: 2, unknown: 2 };
const npmTone = (s: NpmTileInfo['severity']): TvTone => (s === 'critical' || s === 'malware' ? 'critical' : s === 'high' ? 'high' : 'info');

function npmTile(id: string, severity: NpmTileInfo['severity'], time: string, headline: string, packages: string[], range: { vulnerable: string; patched?: string }, cves: string[], hits: Hit[] = []): TvTile {
  const watched = hits.map(h => h.name.toLowerCase());
  const ordered = [...new Set(packages)].sort((a, b) => Number(watched.includes(b.toLowerCase())) - Number(watched.includes(a.toLowerCase())));
  const info: NpmTileInfo = { severity, packages: ordered, vulnerable: range.vulnerable, ids: [id, ...cves], yours: hits.map(h => h.label) };
  if (range.patched) info.patched = range.patched;
  return {
    id: `npm-${id}`,
    kind: 'npm',
    tone: npmTone(severity),
    source: severity === 'malware' ? 'npm malware' : 'npm advisory',
    time,
    headline,
    weight: NPM_WEIGHT[severity] + (hits.length ? 4 : 0),
    url: ghsaUrl(id),
    npm: info,
  };
}

/**
 * The npm tiles: advisories affecting a watched package (malware releases first, then advisories, newest first in
 * each, at any age the data holds), then the others by `tier` (0 first, 1 next, null left out), newest first in each. Withdrawn advisories never show.
 */
function npmTiles(data: NpmAdvisoryData, malware: NpmMalwareData | null, results: PackageResult[], tier: (a: NpmAdvisory) => number | null, max: number): TvTile[] {
  const hits = watchedHits(results);
  const newest = (a: { time?: string }, b: { time?: string }) => timeOf(b.time ?? '') - timeOf(a.time ?? '');

  const mal: TvTile[] = [];
  const seen = new Set<string>();
  for (const [id, pkg, vulnerable, published] of malware?.entries ?? []) {
    const h = hits.get(id)?.filter(x => x.name.toLowerCase() === pkg.toLowerCase());
    if (!h?.length || seen.has(id)) continue;
    seen.add(id);
    mal.push(npmTile(id, 'malware', published, `Malicious release of ${pkg}`, [pkg], { vulnerable }, [], h));
  }

  const yours: TvTile[] = [];
  const tiers: TvTile[][] = [[], []];
  for (const a of data.recent) {
    if (a.withdrawn) continue;
    const h = hits.get(a.id);
    const t = h?.length ? null : tier(a);
    if (!h?.length && t === null) continue;
    // The range shown: the one that matched the watched version, else the advisory's first
    const range = h?.[0] ?? a.ranges[0] ?? { vulnerable: '' };
    const tile = npmTile(a.id, a.severity, a.published, a.summary, a.ranges.map(r => r.package), range, a.cves, h);
    (h?.length ? yours : tiers[t!]).push(tile);
  }
  return [...mal.sort(newest), ...yours.sort(newest), ...tiers[0].sort(newest), ...tiers[1].sort(newest)].slice(0, max);
}

const within = (iso: string, now: number, ms: number) => {
  const t = timeOf(iso);
  return t > 0 && now - t <= ms;
};

/** The npm wall: 7 days of advisories, critical and high first, then medium; plus everything affecting a watched package (first) */
export function tilesForNpm(data: NpmAdvisoryData, malware: NpmMalwareData | null, results: PackageResult[], now: number, max = 30): TvTile[] {
  return npmTiles(data, malware, results, a => {
    if (!within(a.published, now, 7 * DAY_MS)) return null;
    return a.severity === 'critical' || a.severity === 'high' ? 0 : a.severity === 'medium' ? 1 : null;
  }, max);
}

/** Mixed mode's npm tiles: critical and high advisories from the last 48 hours, plus everything affecting a watched package (first) */
export function npmTilesForMix(data: NpmAdvisoryData, malware: NpmMalwareData | null, results: PackageResult[], now: number, max = 10): TvTile[] {
  return npmTiles(data, malware, results, a => (
    within(a.published, now, 48 * HOUR_MS) && (a.severity === 'critical' || a.severity === 'high') ? 0 : null
  ), max);
}

const STORY_SHAPES: Shape[] = ['1x1', '2x1', '2x2'];

/** Wall items for the tile engine: every TV tile can take any shape; its rank weight is kept */
export function toEngineItems(tiles: TvTile[]): EngineItem[] {
  return tiles.map(t => ({ id: t.id, weight: t.weight, shapes: [...STORY_SHAPES] }));
}
