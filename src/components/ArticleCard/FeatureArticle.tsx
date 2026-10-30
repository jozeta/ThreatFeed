import React, { useMemo } from 'react';
import { EntityText } from '../EntityText';
import { TagChip } from '../TagChip';
import { Article } from '../../types';
import { ArticleImage } from '../Common/ArticleImage';
import { ArticleActions } from '../Common/ArticleActions';
import { formatRelativeTime } from '../../utils/date';
import { SeverityBadge, WatchlistBadge, CveChip, ClusterPill, StackBadge } from '../Common/ThreatBadges';
import { checkWatchlistMatch } from '../../services/intelligence/watchlist';
import { useSettings } from '../../context/SettingsContext';

interface FeatureArticleProps {
  article: Article;
  onOpen: () => void;
  orientation?: 'vertical' | 'horizontal';
  showBorder?: boolean;
  className?: string;
  clusterCount?: number;
  clusterSources?: string[];
  onOpenCluster?: () => void;
}

export const FeatureArticle: React.FC<FeatureArticleProps> = ({
  article,
  onOpen,
  orientation = 'vertical',
  showBorder = true,
  className = '',
  clusterCount = 1,
  clusterSources = [],
  onOpenCluster
}) => {
  const { settings } = useSettings();
  const watchlistMatch = useMemo(
    () => checkWatchlistMatch(article, settings.watchlistKeywords),
    [article, settings.watchlistKeywords]
  );
  return (
    <article
      onClick={onOpen}
      className={`lift-flat group cursor-pointer flex ${
        showBorder ? 'border-b border-theme-border pb-5 mb-5' : ''
      } ${
        orientation === 'horizontal' ? 'flex-col sm:flex-row gap-4' : 'flex-col'
      } ${article.read ? 'opacity-85' : 'opacity-100'} ${className}`}
    >
      {/* Thumbnail or Featured Image */}
      <div
        className={`${
          orientation === 'horizontal'
            ? 'w-full sm:w-48 sm:h-36 flex-shrink-0'
            : 'w-full mb-3'
        } rounded-sm overflow-hidden border border-theme-border/40`}
      >
        <ArticleImage
          src={article.image}
          alt={article.title}
          sourceName={article.sourceName}
          category={article.categories[0] || 'Intelligence'}
          aspectClass={orientation === 'horizontal' ? 'aspect-video sm:h-full' : 'aspect-[16/10]'}
        />
      </div>

      {/* Content */}
      <div className="flex flex-col flex-grow min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={article.severity} />
            <StackBadge article={article} />
            {watchlistMatch.matched && (
              <WatchlistBadge terms={watchlistMatch.matchedTerms} />
            )}
            <span className="font-mono text-[10px] uppercase tracking-wider text-theme-accent font-semibold truncate">
              {article.sourceName}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!article.read && (
              <span className="w-1.5 h-1.5 rounded-full bg-theme-accent" />
            )}
            <time className="font-mono text-[11px] text-theme-text-muted flex-shrink-0">
              {formatRelativeTime(article.publishedAt)}
            </time>
          </div>
        </div>

        <h3 className="font-serif text-lg sm:text-xl font-bold text-theme-text group-hover:text-theme-accent transition-colors leading-snug mb-2">
          {article.title}
        </h3>

        {article.description && (
          <p className="font-serif text-sm text-theme-text-muted leading-relaxed line-clamp-2 mb-3">
            <EntityText text={article.description} context={article.title} />
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1 overflow-hidden">
            {article.tags.slice(0, 2).map((tag) => (
              <TagChip
                key={tag}
                tag={tag}
                className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-theme-card text-theme-text-muted truncate max-w-[120px] hover:text-theme-accent"
              >
                #{tag}
              </TagChip>
            ))}
            {article.cves && article.cves.slice(0, 2).map((cve) => (
              <CveChip key={cve} cve={cve} />
            ))}
            {clusterCount > 1 && (
              <ClusterPill
                count={clusterCount}
                sources={clusterSources}
                onClick={onOpenCluster}
              />
            )}
          </div>
          <ArticleActions article={article} compact onOpenReader={onOpen} />
        </div>
      </div>
    </article>
  );
};
