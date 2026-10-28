import { Article, CveIntel, StoryCluster } from '../../types';
import { clusterArticles } from '../articles/clustering';
import { checkWatchlistMatch } from './watchlist';
import { stackMatches } from './stack';
import { computeTrending, TrendingEntity } from './trending';
import { ransomwareVictims, RansomwareVictim } from './ransomware';

export interface BriefingStory {
  cluster: StoryCluster;
  watchlistTerms: string[];
  stackTerms: string[];
}

export interface KevEntry {
  cve: string;
  intel: CveIntel;
  articles: Article[];
}

export interface Briefing {
  generatedAt: string;
  windowHours: number;
  articleCount: number;
  topStories: BriefingStory[]; // critical/high clusters, most severe first
  watchlist: BriefingStory[];
  stack: BriefingStory[];
  newKev: KevEntry[]; // CVEs in the news that CISA added to KEV in the last few days
  ransomware: { victims: RansomwareVictim[]; byGroup: [string, number][] };
  trending: TrendingEntity[];
}

const HOUR_MS = 60 * 60 * 1000;
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 } as const;

export function buildBriefing(
  articles: Article[],
  cveIntel: Record<string, CveIntel>,
  watchlistKeywords: string[],
  stackKeywords: string[],
  windowHours = 24,
  now = Date.now()
): Briefing {
  const since = now - windowHours * HOUR_MS;
  const inWindow = articles.filter(a => new Date(a.publishedAt).getTime() >= since);
  const victims = ransomwareVictims(inWindow);
  const victimIds = new Set(victims.map(v => v.id));
  const news = inWindow.filter(a => !victimIds.has(a.id));

  const stories: BriefingStory[] = clusterArticles(news).map(cluster => {
    const all = [cluster.primaryArticle, ...cluster.relatedArticles];
    const terms = (fn: (a: Article) => string[]) => [...new Set(all.flatMap(fn))];
    return {
      cluster,
      watchlistTerms: terms(a => checkWatchlistMatch(a, watchlistKeywords).matchedTerms),
      stackTerms: terms(a => stackMatches(a, stackKeywords)),
    };
  });
  const rank = (s: BriefingStory) => {
    const p = s.cluster.primaryArticle;
    return SEVERITY_RANK[p.severity || 'info'] * 1000 + (p.severityScore ?? 0) * 10 + s.cluster.clusterSize;
  };
  stories.sort((a, b) => rank(b) - rank(a));

  const kevCutoff = new Date(now - 7 * 24 * HOUR_MS).toISOString().slice(0, 10);
  const kevMap = new Map<string, KevEntry>();
  for (const a of inWindow) {
    for (const cve of a.cves || []) {
      const intel = cveIntel[cve.toUpperCase()];
      if (!intel?.kev || !intel.kevDateAdded || intel.kevDateAdded < kevCutoff) continue;
      const entry = kevMap.get(cve) || { cve, intel, articles: [] };
      entry.articles.push(a);
      kevMap.set(cve, entry);
    }
  }

  const byGroup = new Map<string, number>();
  for (const v of victims) byGroup.set(v.group, (byGroup.get(v.group) || 0) + 1);

  return {
    generatedAt: new Date(now).toISOString(),
    windowHours,
    articleCount: inWindow.length,
    topStories: stories.filter(s => ['critical', 'high'].includes(s.cluster.primaryArticle.severity || '')).slice(0, 12),
    watchlist: stories.filter(s => s.watchlistTerms.length > 0).slice(0, 15),
    stack: stories.filter(s => s.stackTerms.length > 0).slice(0, 15),
    newKev: [...kevMap.values()].sort((a, b) => (b.intel.kevDateAdded || '').localeCompare(a.intel.kevDateAdded || '')),
    ransomware: { victims, byGroup: [...byGroup.entries()].sort((a, b) => b[1] - a[1]) },
    trending: computeTrending(articles, stackKeywords, 7, now).slice(0, 10),
  };
}

const link = (a: Article) => (a.url ? `[${a.title}](${a.url})` : a.title);
const sources = (s: BriefingStory) =>
  s.cluster.clusterSize > 1 ? ` (${s.cluster.clusterSize} sources)` : ` (${s.cluster.primaryArticle.sourceName})`;

export function briefingToMarkdown(b: Briefing): string {
  const date = new Date(b.generatedAt).toUTCString();
  const out: string[] = [`# ThreatFeed Daily Briefing`, ``, `_${date} · last ${b.windowHours}h · ${b.articleCount} articles_`, ``];

  const storyList = (title: string, items: BriefingStory[], extra?: (s: BriefingStory) => string) => {
    if (items.length === 0) return;
    out.push(`## ${title}`, '');
    for (const s of items) {
      const p = s.cluster.primaryArticle;
      out.push(`- **${(p.severity || 'info').toUpperCase()}** ${link(p)}${sources(s)}${extra ? extra(s) : ''}`);
    }
    out.push('');
  };

  storyList('Critical & High Severity', b.topStories, s => (s.cluster.primaryArticle.cves?.length ? ` · ${s.cluster.primaryArticle.cves.slice(0, 3).join(', ')}` : ''));

  if (b.newKev.length > 0) {
    out.push('## Recently Added to CISA KEV', '');
    for (const k of b.newKev) {
      out.push(`- **${k.cve}** (added ${k.intel.kevDateAdded}${k.intel.kevRansomware ? ', used by ransomware' : ''})${k.intel.kevName ? `: ${k.intel.kevName}` : ''}${k.intel.epss !== undefined ? ` · EPSS ${(k.intel.epss * 100).toFixed(1)}%` : ''}`);
    }
    out.push('');
  }

  storyList('Watchlist Hits', b.watchlist, s => ` · _${s.watchlistTerms.slice(0, 3).join(', ')}_`);
  storyList('Relevant to Your Stack', b.stack, s => ` · _${s.stackTerms.slice(0, 3).join(', ')}_`);

  if (b.ransomware.victims.length > 0) {
    out.push('## Ransomware Activity', '', `${b.ransomware.victims.length} new leak-site victims: ${b.ransomware.byGroup.map(([g, n]) => `${g} (${n})`).join(', ')}`, '');
  }

  if (b.trending.length > 0) {
    out.push('## Trending This Week', '');
    for (const t of b.trending) out.push(`- ${t.name} (${t.kind}): ${t.count} mentions${t.previous ? `, ${t.previous} the week before` : ''}`);
    out.push('');
  }

  return out.join('\n');
}
