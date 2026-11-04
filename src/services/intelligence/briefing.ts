import { Article, BreachRecord, CveIntel, CveRecord, IncidentData, KevEntry as KevCatalogEntry, OssAdvisory, StoryCluster, VulnData } from '../../types';
import { containsTerm } from '../../utils/textMatch';
import { groupDisplayName } from '../../utils/countries';
import { clusterArticles } from '../articles/clustering';
import { checkWatchlistMatch } from './watchlist';
import { stackMatches } from './stack';
import { computeTrending, TrendingEntity } from './trending';
import { ransomwareVictims } from './ransomware';
import { safeHttpUrl } from '../rss/sanitizer';

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
  ransomware: { count: number; byGroup: [string, number][] };
  breaches: BreachRecord[]; // added to Have I Been Pwned in the window
  trending: TrendingEntity[];
  // Vulnerability data matching the user's stack (needs data/vulns.json; empty without it)
  stackVulns: {
    kev: (KevCatalogEntry & { terms: string[] })[]; // added to KEV in the window
    cves: (CveRecord & { terms: string[] })[]; // critical CVEs published in the window
    advisories: (OssAdvisory & { terms: string[] })[]; // GitHub advisories published in the window
  };
}

/** Stack keywords found (whole word) in a piece of text */
const stackTerms = (text: string, keywords: string[]) => keywords.filter(k => containsTerm(text, k));

const HOUR_MS = 60 * 60 * 1000;
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 } as const;

export function buildBriefing(
  articles: Article[],
  cveIntel: Record<string, CveIntel>,
  watchlistKeywords: string[],
  stackKeywords: string[],
  windowHours = 24,
  now = Date.now(),
  incidents: IncidentData | null = null, // structured leak-site victims + HIBP breaches from the snapshot
  vulns: VulnData | null = null // KEV catalog, critical NVD CVEs, GitHub advisories
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

  // Leak-site activity: structured victims when the snapshot has them, else the parsed RSS posts
  const leakGroups = incidents?.victims.length
    ? incidents.victims.filter(v => new Date(v.discoveredAt).getTime() >= since).map(v => groupDisplayName(v.group))
    : victims.map(v => v.group);
  const byGroup = new Map<string, number>();
  for (const g of leakGroups) byGroup.set(g, (byGroup.get(g) || 0) + 1);
  const sinceIso = new Date(since).toISOString();

  // KEV dates have no time, so a 24-hour window covers today and yesterday
  const sinceDay = sinceIso.slice(0, 10);
  const withTerms = <T,>(items: T[], text: (item: T) => string) =>
    stackKeywords.length === 0 ? [] : items.map(item => ({ ...item, terms: stackTerms(text(item), stackKeywords) })).filter(x => x.terms.length > 0);
  const stackVulns: Briefing['stackVulns'] = {
    // NVD's affected-product list (CNA names and CPEs) catches products the description doesn't name
    kev: withTerms((vulns?.kev ?? []).filter(k => k.dateAdded >= sinceDay), k => `${k.vendor} ${k.product} ${k.name} ${(k.products ?? []).join(' ')}`),
    cves: withTerms((vulns?.notable ?? []).filter(r => r.published >= sinceIso), r => `${r.description ?? ''} ${(r.products ?? []).join(' ')}`),
    advisories: withTerms((vulns?.advisories ?? []).filter(a => a.publishedAt >= sinceIso), a => `${a.ecosystem ?? ''} ${a.package ?? ''} ${a.summary}`),
  };

  return {
    generatedAt: new Date(now).toISOString(),
    windowHours,
    articleCount: inWindow.length,
    topStories: stories.filter(s => ['critical', 'high'].includes(s.cluster.primaryArticle.severity || '')).slice(0, 12),
    watchlist: stories.filter(s => s.watchlistTerms.length > 0).slice(0, 15),
    stack: stories.filter(s => s.stackTerms.length > 0).slice(0, 15),
    newKev: [...kevMap.values()].sort((a, b) => (b.intel.kevDateAdded || '').localeCompare(a.intel.kevDateAdded || '')),
    ransomware: { count: leakGroups.length, byGroup: [...byGroup.entries()].sort((a, b) => b[1] - a[1]) },
    breaches: (incidents?.breaches ?? []).filter(b => b.addedAt >= sinceIso),
    trending: computeTrending(articles, stackKeywords, 7, now, incidents?.victims.length ? incidents.victims : undefined).slice(0, 10),
    stackVulns,
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

  const { kev, cves, advisories } = b.stackVulns;
  if (kev.length + cves.length + advisories.length > 0) {
    out.push('## Vulnerabilities in Your Stack', '');
    for (const k of kev) out.push(`- **${k.cve}** added to CISA KEV ${k.dateAdded}: ${k.name}${k.cvss ? ` · CVSS ${k.cvss}` : ''} · _${k.terms.join(', ')}_`);
    for (const r of cves) out.push(`- **${r.id}** (CVSS ${r.score}): ${r.description ?? ''} · _${r.terms.join(', ')}_`);
    for (const a of advisories) out.push(`- [${a.id}](${a.url}) (${a.severity}, ${a.ecosystem}/${a.package}): ${a.summary} · _${a.terms.join(', ')}_`);
    out.push('');
  }

  if (b.ransomware.count > 0) {
    out.push('## Ransomware Activity', '', `${b.ransomware.count} new leak-site victims: ${b.ransomware.byGroup.slice(0, 12).map(([g, n]) => `${g} (${n})`).join(', ')}`, '');
  }

  if (b.breaches.length > 0) {
    out.push('## New Breaches (Have I Been Pwned)', '');
    for (const br of b.breaches) out.push(`- **${br.title}**${br.domain ? ` (${br.domain})` : ''}: ${br.records.toLocaleString('en-US')} accounts · ${br.dataClasses.slice(0, 5).join(', ')}`);
    out.push('');
  }

  if (b.trending.length > 0) {
    out.push('## Trending This Week', '');
    for (const t of b.trending) out.push(`- ${t.name} (${t.kind}): ${t.count} mentions${t.previous ? `, ${t.previous} the week before` : ''}`);
    out.push('');
  }

  return out.join('\n');
}

const escapeHtml = (text: unknown) =>
  String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * The briefing as a self-contained HTML document (inline styles only; it is a download or clipboard payload, not part
 * of the site). Same sections as the Markdown. Every text is escaped and links must pass safeHttpUrl.
 */
export function briefingToHtml(b: Briefing): string {
  const e = escapeHtml;
  const a = (url: string | undefined, label: string) => {
    const href = safeHttpUrl(url);
    return href ? `<a href="${e(href)}" style="color:#1d4ed8">${e(label)}</a>` : e(label);
  };
  const em = (text: string) => `<em>${e(text)}</em>`;
  const h2Style = 'font-size:16px;border-bottom:2px solid #1f2937;padding-bottom:4px;margin:24px 0 8px';
  const section = (title: string, items: string[]) =>
    items.length === 0 ? '' : `<h2 style="${h2Style}">${e(title)}</h2>\n<ul style="padding-left:20px;margin:0">\n${items.map(i => `<li style="margin:4px 0">${i}</li>`).join('\n')}\n</ul>`;

  const stories = (items: BriefingStory[], extra?: (s: BriefingStory) => string) =>
    items.map(s => {
      const p = s.cluster.primaryArticle;
      return `<strong>${e((p.severity || 'info').toUpperCase())}</strong> ${a(p.url, p.title)}${e(sources(s))}${extra ? extra(s) : ''}`;
    });

  const date = new Date(b.generatedAt).toUTCString();
  const body: string[] = [
    section('Critical & High Severity', stories(b.topStories, s => (s.cluster.primaryArticle.cves?.length ? ` · ${e(s.cluster.primaryArticle.cves.slice(0, 3).join(', '))}` : ''))),
    section('Recently Added to CISA KEV', b.newKev.map(k =>
      `<strong>${e(k.cve)}</strong> (added ${e(k.intel.kevDateAdded)}${k.intel.kevRansomware ? ', used by ransomware' : ''})${k.intel.kevName ? `: ${e(k.intel.kevName)}` : ''}${k.intel.epss !== undefined ? ` · EPSS ${(k.intel.epss * 100).toFixed(1)}%` : ''}`)),
    section('Watchlist Hits', stories(b.watchlist, s => ` · ${em(s.watchlistTerms.slice(0, 3).join(', '))}`)),
    section('Relevant to Your Stack', stories(b.stack, s => ` · ${em(s.stackTerms.slice(0, 3).join(', '))}`)),
    section('Vulnerabilities in Your Stack', [
      ...b.stackVulns.kev.map(k => `<strong>${e(k.cve)}</strong> added to CISA KEV ${e(k.dateAdded)}: ${e(k.name)}${k.cvss ? ` · CVSS ${e(k.cvss)}` : ''} · ${em(k.terms.join(', '))}`),
      ...b.stackVulns.cves.map(r => `<strong>${e(r.id)}</strong> (CVSS ${e(r.score)}): ${e(r.description ?? '')} · ${em(r.terms.join(', '))}`),
      ...b.stackVulns.advisories.map(x => `${a(x.url, x.id)} (${e(x.severity)}, ${e(x.ecosystem)}/${e(x.package)}): ${e(x.summary)} · ${em(x.terms.join(', '))}`),
    ]),
    b.ransomware.count > 0
      ? `<h2 style="${h2Style}">Ransomware Activity</h2>\n<p>${b.ransomware.count} new leak-site victims: ${e(b.ransomware.byGroup.slice(0, 12).map(([g, n]) => `${g} (${n})`).join(', '))}</p>`
      : '',
    section('New Breaches (Have I Been Pwned)', b.breaches.map(br =>
      `<strong>${e(br.title)}</strong>${br.domain ? ` (${e(br.domain)})` : ''}: ${e(br.records.toLocaleString('en-US'))} accounts · ${e(br.dataClasses.slice(0, 5).join(', '))}`)),
    section('Trending This Week', b.trending.map(t =>
      `${e(t.name)} (${e(t.kind)}): ${t.count} mentions${t.previous ? `, ${t.previous} the week before` : ''}`)),
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ThreatFeed Daily Briefing</title>
</head>
<body style="font-family:Georgia,serif;color:#111827;background:#ffffff;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.5">
<h1 style="font-size:24px;margin:0 0 4px">ThreatFeed Daily Briefing</h1>
<p style="color:#4b5563;margin:0">${em(`${date} · last ${b.windowHours}h · ${b.articleCount} articles`)}</p>
${body.join('\n')}
</body>
</html>
`;
}
