import React, { useMemo, useState } from 'react';
import { Article } from '../../types';
import { clusterArticles } from '../../services/articles/clustering';
import { classifyIncident, isLeakSitePost } from '../../services/intelligence/incidents';
import { SeverityBadge } from '../../components/Common/ThreatBadges';
import { EntityText } from '../../components/EntityText';
import { formatRelativeTime } from '../../utils/date';
import { TagChip } from '../../components/TagChip';
import { chipClass, SectionTitle } from './shared';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [{ days: 1, label: '24h' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }];

/** News coverage of ransomware attacks and data breaches from the user's feeds, grouped by story. */
export const IncidentNewsTab: React.FC<{ articles: Article[]; groupNames: string[]; onOpenArticle: (a: Article) => void }> = ({ articles, groupNames, onOpenArticle }) => {
  const [days, setDays] = useState(7);

  const { ransomware, breach } = useMemo(() => {
    const since = Date.now() - days * DAY_MS;
    // Leak-site posts have their own tab; this one is about reporting
    const recent = articles.filter((a) => !isLeakSitePost(a) && new Date(a.publishedAt).getTime() >= since);
    const byKind = { ransomware: [] as Article[], breach: [] as Article[] };
    for (const a of recent) {
      const kind = classifyIncident(a, groupNames);
      if (kind) byKind[kind].push(a);
    }
    const stories = (list: Article[]) => clusterArticles(list).sort((a, b) =>
      b.clusterSize - a.clusterSize || b.primaryArticle.publishedAt.localeCompare(a.primaryArticle.publishedAt));
    return { ransomware: stories(byKind.ransomware), breach: stories(byKind.breach) };
  }, [articles, groupNames, days]);

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
              {/* The title opens the article; names in the summary open their panels */}
              {p.description && <p className="text-xs font-serif text-theme-text-muted mt-0.5 pl-1 line-clamp-2"><EntityText text={p.description} context={p.title} /></p>}
              <p className="text-[11px] font-mono text-theme-text-muted mt-0.5 pl-1">
                {p.sourceName}{s.clusterSize > 1 && <span className="text-theme-accent"> +{s.clusterSize - 1} sources</span>} · {formatRelativeTime(p.publishedAt)}
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {column('Ransomware attacks', ransomware)}
        {column('Data breaches & leaks', breach)}
      </div>
      <p className="text-[11px] font-serif text-theme-text-muted">Articles from your feeds that report an attack or breach, grouped so each incident appears once with its number of sources.</p>
    </div>
  );
};
