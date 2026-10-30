import React, { useMemo } from 'react';
import { Article } from '../../types';
import { TagChip } from '../TagChip';
import { ArticleActions } from '../Common/ArticleActions';
import { formatRelativeTime } from '../../utils/date';
import { SeverityBadge, WatchlistBadge, ClusterPill, StackBadge } from '../Common/ThreatBadges';
import { checkWatchlistMatch } from '../../services/intelligence/watchlist';
import { useSettings } from '../../context/SettingsContext';

interface ListArticleProps {
  article: Article;
  onOpen: () => void;
  clusterCount?: number;
  clusterSources?: string[];
  onOpenCluster?: () => void;
}

export const ListArticle: React.FC<ListArticleProps> = ({
  article,
  onOpen,
  clusterCount,
  clusterSources,
  onOpenCluster,
}) => {
  const { settings } = useSettings();
  const watchlistMatch = useMemo(
    () => checkWatchlistMatch(article, settings.watchlistKeywords),
    [article, settings.watchlistKeywords]
  );

  return (
    <article
      onClick={onOpen}
      className={`lift-flat group cursor-pointer flex items-center justify-between gap-3 px-4 py-3 border-b border-theme-border/60 hover:bg-theme-surface/80 ${
        article.read ? 'opacity-80' : 'opacity-100 font-medium'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-grow">
        {/* Read / Freshness Indicator */}
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            article.read ? 'bg-transparent' : 'bg-theme-accent'
          }`}
        />

        {/* Time Stamp */}
        <time className="font-mono text-xs text-theme-text-muted flex-shrink-0 w-16 text-right">
          {formatRelativeTime(article.publishedAt)}
        </time>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <SeverityBadge severity={article.severity} score={article.severityScore} />
          <StackBadge article={article} />
          {watchlistMatch.matched && <WatchlistBadge terms={watchlistMatch.matchedTerms} />}
        </div>

        {/* Headline */}
        <div className="min-w-0 flex-grow flex items-center gap-2">
          <h4 className="font-serif text-sm sm:text-base text-theme-text group-hover:text-theme-accent transition-colors truncate">
            {article.title}
          </h4>

          {article.bookmarked && (
            <span className="text-[10px] font-mono px-1 rounded bg-theme-accent-subtle text-theme-accent flex-shrink-0">
              SAVED
            </span>
          )}

          {clusterCount && clusterCount > 1 && clusterSources && (
            <div className="hidden sm:inline-flex flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <ClusterPill count={clusterCount} sources={clusterSources} onClick={onOpenCluster} />
            </div>
          )}
        </div>

        {/* Source & Category */}
        <div className="hidden md:flex items-center gap-2 text-xs font-mono text-theme-text-muted flex-shrink-0 max-w-[200px] truncate">
          <span className="text-theme-accent truncate">{article.sourceName}</span>
          <span className="text-theme-border">·</span>
          {article.categories[0]
            ? <TagChip tag={article.categories[0]} className="truncate hover:text-theme-accent">{article.categories[0]}</TagChip>
            : <span className="truncate">Security</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0">
        <ArticleActions article={article} compact onOpenReader={onOpen} />
      </div>
    </article>
  );
};

