import { Article, LeakSiteVictim } from '../../types';
import { groupDisplayName } from '../../utils/countries';
import { containsTerm } from '../../utils/textMatch';
import { WATCHLIST_PRESETS } from './watchlist';
import { ransomwareVictims } from './ransomware';

export type EntityKind = 'cve' | 'ransomware' | 'actor' | 'product';

export interface TrendingEntity {
  kind: EntityKind;
  name: string;
  count: number; // distinct articles in the current window
  previous: number; // distinct articles in the window before it
  daily: number[]; // per-day counts, oldest first, for a sparkline
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const presetTerms = (id: string) => WATCHLIST_PRESETS.find(p => p.id === id)?.keywords ?? [];

// CVE list feeds mention each CVE once by design; counting them would just rank by feed volume
const CVE_LIST_SOURCES = new Set(['cvefeed-latest', 'msrc-update-guide', 'zdi-advisories']);

/**
 * The CVEs and vocabulary terms an article mentions, shared by trending and the trends history. CVEs come
 * once each (not from CVE list feeds); a term comes once per vocabulary entry it is listed in. Leak-site posts
 * (ransomware.live) name their group in the title; with `leakSitePosts` false they match no terms at all.
 */
export function articleMentions<K extends string>(
  a: Article,
  vocab: { kind: K; terms: string[] }[],
  leakSitePosts: boolean
): { kind: K | 'cve'; name: string }[] {
  const found: { kind: K | 'cve'; name: string }[] = [];
  if (!CVE_LIST_SOURCES.has(a.sourceId)) {
    for (const cve of new Set(a.cves || [])) found.push({ kind: 'cve', name: cve });
  }
  if (!leakSitePosts && a.sourceId === 'ransomware-live') return found;
  const text = `${a.title} ${a.description || ''}`;
  const lower = text.toLowerCase();
  const victimGroup = a.sourceId === 'ransomware-live' ? a.title.match(/^\W*(.+?) has just published/u)?.[1]?.toLowerCase() : undefined;
  for (const { kind, terms } of vocab) {
    for (const term of terms) {
      const key = term.toLowerCase();
      // The substring check is a cheap filter before the whole-word regex; it never rejects a match
      if ((kind === 'ransomware' && victimGroup === key) || (lower.includes(key) && containsTerm(text, term))) found.push({ kind, name: term });
    }
  }
  return found;
}

/**
 * Which CVEs, ransomware groups, threat actors and frequently exploited products are mentioned
 * most in the last `days` days, compared with the `days` before. Ransomware groups also count
 * their leak-site posts (ransomware.live), which is where their activity actually shows.
 */
export function computeTrending(
  articles: Article[],
  extraProducts: string[] = [],
  days = 7,
  now = Date.now(),
  leakSiteVictims?: LeakSiteVictim[] // structured victims from the snapshot; replaces parsing the RSS feed
): TrendingEntity[] {
  const start = now - days * DAY_MS;
  const prevStart = start - days * DAY_MS;
  const recent = articles.filter(a => new Date(a.publishedAt).getTime() >= prevStart);

  const victimGroups = leakSiteVictims ? leakSiteVictims.map(v => groupDisplayName(v.group)) : ransomwareVictims(recent).map(v => v.group);
  const groups = new Set([...presetTerms('ransomware').filter(t => /^[A-Z]/.test(t)), ...victimGroups]);
  const vocab: { kind: EntityKind; terms: string[] }[] = [
    { kind: 'ransomware', terms: [...groups] },
    { kind: 'actor', terms: presetTerms('apt') },
    { kind: 'product', terms: [...new Set([...presetTerms('edge-devices'), ...extraProducts])] },
  ];

  const stats = new Map<string, TrendingEntity>();
  const bump = (kind: EntityKind, name: string, t: number) => {
    const key = `${kind}:${name.toLowerCase()}`;
    let e = stats.get(key);
    if (!e) {
      e = { kind, name, count: 0, previous: 0, daily: new Array(days).fill(0) };
      stats.set(key, e);
    }
    if (t >= start) {
      e.count++;
      e.daily[Math.min(days - 1, Math.floor((t - start) / DAY_MS))]++;
    } else {
      e.previous++;
    }
  };

  for (const a of recent) {
    const t = new Date(a.publishedAt).getTime();
    if (isNaN(t)) continue;
    // With structured victims, leak-site posts are counted from that data below instead of from the RSS feed
    for (const m of articleMentions(a, vocab, !leakSiteVictims)) bump(m.kind, m.name, t);
  }

  for (const v of leakSiteVictims ?? []) {
    const t = new Date(v.discoveredAt).getTime();
    if (t >= prevStart) bump('ransomware', groupDisplayName(v.group), t);
  }

  return [...stats.values()]
    .filter(e => e.count >= 2)
    .sort((a, b) => b.count - a.count || (b.count - b.previous) - (a.count - a.previous));
}
