import type { Article, LeakSiteVictim, MsrcData, VulnData } from '../../types';
import { newsCandidates, ransomwareCandidates, vulnCandidates, type FeedCandidate, type FeedName } from './candidates';
import { emptyLedger, FEED_NAMES, pickPubDate, pruneLedger, type FeedLedger, type LedgerEntry } from './ledger';
import { renderRss, type RssItem } from './rss';

export interface FeedInput {
  articles: Article[];
  victims: LeakSiteVictim[];
  vulns: VulnData | null;
  msrc: MsrcData | null;
}

export interface FeedBuild {
  files: Record<FeedName, string>; // RSS XML per feed
  ledger: FeedLedger;
  counts: Record<FeedName, number>; // items per feed
}

export const FEED_CAPS: Record<FeedName, number> = { news: 100, vulns: 100, ransomware: 400 };

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const CHANNELS: Record<FeedName, { title: string; description: string }> = {
  news: {
    title: 'ThreatFeed — News',
    description: 'Important security stories from ThreatFeed, one per story.',
  },
  vulns: {
    title: 'ThreatFeed — Vulnerabilities',
    description: 'New CISA KEV entries, critical CVEs, public exploits and Patch Tuesday, from ThreatFeed.',
  },
  ransomware: {
    title: 'ThreatFeed — Ransomware',
    description: 'Ransomware leak-site victims and ransomware news, from ThreatFeed.',
  },
};

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Matches one feed's candidates against its ledger entries, updating `entries` in place, and
 * returns the items to render. An item is announced once under one guid: a match keeps the
 * existing guid and firstSeen, and a second kind or a split cluster of the same thing is skipped.
 */
function assemble(
  candidates: FeedCandidate[],
  entries: Map<string, LedgerEntry>,
  firstRun: boolean,
  now: number,
): RssItem[] {
  const nowIso = new Date(now).toISOString();
  const keyIndex = new Map<string, string>();
  for (const [guid, entry] of entries) {
    for (const key of entry.keys) if (!keyIndex.has(key)) keyIndex.set(key, guid);
  }

  const sorted = [...candidates].sort((a, b) =>
    a.rank - b.rank || compare(a.sourceTime ?? '', b.sourceTime ?? '') || compare(a.guid, b.guid));
  const rendered = new Set<string>();
  const items: RssItem[] = [];
  const render = (c: FeedCandidate, guid: string, entry: LedgerEntry) => {
    rendered.add(guid);
    // Fixed on first render, so a later lead article with another source time can't move it.
    // Entries from before pubDate was stored get it here.
    entry.pubDate ??= pickPubDate(c.sourceTime, entry.firstSeen);
    items.push({
      guid, title: c.title, description: c.description, link: c.link, categories: c.categories,
      pubDate: entry.pubDate,
    });
  };

  for (const c of sorted) {
    const matched = entries.has(c.guid) ? c.guid : c.keys.map((k) => keyIndex.get(k)).find((g) => g !== undefined);
    if (matched !== undefined) {
      const entry = entries.get(matched)!;
      entry.lastSeen = nowIso;
      entry.keys = [...new Set([...entry.keys, ...c.keys])];
      for (const key of c.keys) if (!keyIndex.has(key)) keyIndex.set(key, matched);
      if (entry.published && !rendered.has(matched) && (c.kind === 'news' || matched === c.guid)) {
        render(c, matched, entry);
      }
      continue;
    }
    const published = !(firstRun && c.baseline);
    const entry: LedgerEntry = { firstSeen: nowIso, lastSeen: nowIso, published, keys: [...new Set(c.keys)] };
    entries.set(c.guid, entry);
    for (const key of c.keys) if (!keyIndex.has(key)) keyIndex.set(key, c.guid);
    if (published) render(c, c.guid, entry);
  }
  return items;
}

/** Builds the three RSS feeds and the updated ledger. `previous === null` means the first run. */
export function buildFeeds(input: FeedInput, previous: FeedLedger | null, now: number, site: string): FeedBuild {
  const candidates: Record<FeedName, FeedCandidate[]> = {
    news: newsCandidates(input.articles, now, site),
    vulns: vulnCandidates(input.vulns, input.msrc, now, site),
    ransomware: ransomwareCandidates(input.articles, input.victims, now, site),
  };
  const base = previous ?? emptyLedger();
  const ledger = emptyLedger();
  const files = {} as Record<FeedName, string>;
  const counts = {} as Record<FeedName, number>;
  const nowIso = new Date(now).toISOString();
  const cutoff = now - WINDOW_MS;

  for (const feed of FEED_NAMES) {
    // Copies, so the previous ledger is never mutated
    const entries = new Map(Object.entries(base.feeds[feed]).map(([guid, e]) => [guid, { ...e, keys: [...e.keys] }]));
    const items = assemble(candidates[feed], entries, previous === null, now)
      .filter((item) => Date.parse(item.pubDate) >= cutoff)
      .sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate) || compare(a.guid, b.guid))
      .slice(0, FEED_CAPS[feed]);
    ledger.feeds[feed] = Object.fromEntries(entries);
    counts[feed] = items.length;
    files[feed] = renderRss({
      ...CHANNELS[feed],
      link: site,
      selfUrl: `${site}data/feeds/${feed}.xml`,
      lastBuildDate: nowIso,
    }, items);
  }
  return { files, ledger: pruneLedger(ledger, now), counts };
}
