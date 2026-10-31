import { Article, LeakSiteVictim } from '../../types';
import { Briefing } from '../intelligence/briefing';
import { classifyIncident, isLeakSitePost } from '../intelligence/incidents';
import { clusterArticles } from '../articles/clustering';
import { calculateImportance } from '../articles/importance';
import { countryName } from '../../utils/countries';
import { EngineItem, Shape } from './tileEngine';

export type TvTileKind = 'story' | 'victim' | 'kev' | 'breach' | 'trend';
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

const STORY_SHAPES: Shape[] = ['1x1', '2x1', '2x2'];

/** Wall items for the tile engine: every TV tile can take any shape; its rank weight is kept */
export function toEngineItems(tiles: TvTile[]): EngineItem[] {
  return tiles.map(t => ({ id: t.id, weight: t.weight, shapes: [...STORY_SHAPES] }));
}
