import React, { useMemo, useState } from 'react';
import { Article, Feed } from '../../types';
import { clusterArticles } from '../../services/articles/clustering';
import { SeverityBadge } from '../../components/Common/ThreatBadges';
import { formatRelativeTime } from '../../utils/date';
import { TagChip } from '../../components/TagChip';
import { chipClass, SectionTitle } from '../incidents/shared';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [{ days: 1, label: '24h' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }];
const EXPLOITED = /actively exploited|exploited in the wild|under (active )?exploitation|zero[- ]day|0-day/i;
const ADVISORY_FEED_TAGS = ['advisory', 'psirt', 'patch'];

type Kind = 'exploited' | 'advisory' | 'news';

/**
 * Vulnerability coverage from the user's feeds in three columns: exploited (mentions a KEV CVE or says
 * it is exploited), vendor and CERT advisories, and the rest of the vulnerability reporting.
 */
export function classifyVulnArticle(article: Article, feed: Feed | undefined, kevIds: Set<string>): Kind | null {
  const text = `${article.title} ${article.description || ''}`;
  if (article.cves?.some((c) => kevIds.has(c)) || EXPLOITED.test(text)) return 'exploited';
  if (feed?.tags.some((t) => ADVISORY_FEED_TAGS.includes(t))) return 'advisory';
  if (article.cves?.length || feed?.category === 'Vulnerabilities' || /\bvulnerabilit(y|ies)\b|\bCVE-\d{4}/i.test(text)) return 'news';
  return null;
}

export const VulnNewsTab: React.FC<{ articles: Article[]; feeds: Feed[]; kevIds: Set<string>; onOpenArticle: (a: Article) => void }> = ({ articles, feeds, kevIds, onOpenArticle }) => {
  const [days, setDays] = useState(7);

  const columns = useMemo(() => {
    const feedById = new Map(feeds.map((f) => [f.id, f]));
    const since = Date.now() - days * DAY_MS;
    const byKind: Record<Kind, Article[]> = { exploited: [], advisory: [], news: [] };
    for (const a of articles) {
      if (new Date(a.publishedAt).getTime() < since) continue;
      const kind = classifyVulnArticle(a, feedById.get(a.sourceId), kevIds);
      if (kind) byKind[kind].push(a);
    }
    const stories = (list: Article[]) => clusterArticles(list).sort((a, b) =>
      b.clusterSize - a.clusterSize || b.primaryArticle.publishedAt.localeCompare(a.primaryArticle.publishedAt));
    return { exploited: stories(byKind.exploited), advisory: stories(byKind.advisory), news: stories(byKind.news) };
  }, [articles, feeds, kevIds, days]);

  const column = (title: string, stories: ReturnType<typeof clusterArticles>) => (
    <div>
      <SectionTitle>{title} ({stories.length})</SectionTitle>
      <ul className="divide-y divide-theme-border/60">
        {stories.slice(0, 40).map((s) => {
          const p = s.primaryArticle;
          return (
            <li key={s.id} className="py-2.5">
              <div className="flex items-start gap-2">
                <SeverityBadge severity={p.severity} score={p.severityScore} />
                <button onClick={() => onOpenArticle(p)} className="text-left font-serif font-bold text-sm text-theme-text hover:text-theme-accent leading-snug">{p.title}</button>
              </div>
              <p className="text-[11px] font-mono text-theme-text-muted mt-0.5 pl-1">
                {p.sourceName}{s.clusterSize > 1 && <span className="text-theme-accent"> +{s.clusterSize - 1} sources</span>} · {formatRelativeTime(p.publishedAt)}
                {p.cves?.some((c) => kevIds.has(c)) && <span className="ml-1.5 px-1 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">KEV</span>}
              </p>
              {p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 pl-1">
                  {p.tags.slice(0, 3).map((tag) => (
                    <TagChip key={tag} tag={tag} className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-theme-card text-theme-text-muted hover:text-theme-accent">#{tag}</TagChip>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {stories.length === 0 && <p className="text-xs font-serif italic text-theme-text-muted">Nothing in this period.</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-2">{RANGES.map((r) => <button key={r.days} onClick={() => setDays(r.days)} className={chipClass(days === r.days)}>{r.label}</button>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {column('Exploited in the wild', columns.exploited)}
        {column('Vendor & CERT advisories', columns.advisory)}
        {column('Vulnerability news', columns.news)}
      </div>
      <p className="text-[11px] font-serif text-theme-text-muted">Articles from your feeds grouped so each story appears once with its number of sources. "Exploited" means the article mentions a CVE in CISA's KEV catalog or reports exploitation.</p>
    </div>
  );
};
