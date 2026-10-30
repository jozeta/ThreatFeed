import React, { useMemo } from 'react';
import { Article } from '../../types';
import { useFeeds } from '../../context/FeedContext';
import { computeTrending } from '../../services/intelligence/trending';
import { Sparkline } from '../Common/Sparkline';
import { useOpenTrending } from '../../hooks/useOpenTrending';
import { TrendingUp } from 'lucide-react';

/** One-line "what's being talked about this week" strip; each entity opens its detail panel (CVE, group, actor) or runs a search when clicked. */
export const TrendingStrip: React.FC<{ articles: Article[]; stackKeywords: string[]; onSearch: (query: string) => void }> = ({
  articles,
  stackKeywords,
  onSearch,
}) => {
  const { incidents } = useFeeds();
  const { open, clickHint } = useOpenTrending(onSearch);
  const trending = useMemo(
    () => computeTrending(articles, stackKeywords, 7, Date.now(), incidents?.victims.length ? incidents.victims : undefined).slice(0, 8),
    [articles, stackKeywords, incidents]
  );
  if (trending.length === 0) return null;

  return (
    <div className="flex items-center gap-3 mb-6 pb-3 border-b border-theme-border/60 overflow-x-auto scrollbar-none text-xs font-mono print:hidden">
      <span className="flex items-center gap-1 font-bold uppercase tracking-wider text-theme-text flex-shrink-0">
        <TrendingUp className="w-3.5 h-3.5 text-theme-accent" />
        Trending
      </span>
      {trending.map((t) => (
        <button
          key={`${t.kind}:${t.name}`}
          onClick={() => void open(t)}
          title={`${t.count} articles this week${t.previous ? `, ${t.previous} the week before` : ''}. Click to ${clickHint(t)}.`}
          className="press flex-shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-theme-surface border border-theme-border hover:border-theme-accent text-theme-text transition-colors"
        >
          <span>{t.name}</span>
          <Sparkline values={t.daily} width={36} height={12} className="text-theme-accent" />
          <span className="text-theme-text-muted">{t.count}</span>
        </button>
      ))}
    </div>
  );
};
