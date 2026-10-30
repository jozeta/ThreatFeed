import React, { useMemo } from 'react';
import { EntityText } from '../EntityText';
import { Article } from '../../types';
import { ArticleImage } from '../Common/ArticleImage';
import { ArticleActions } from '../Common/ArticleActions';
import { formatRelativeTime } from '../../utils/date';
import { SeverityBadge, WatchlistBadge, StackBadge } from '../Common/ThreatBadges';
import { checkWatchlistMatch } from '../../services/intelligence/watchlist';
import { useSettings } from '../../context/SettingsContext';

interface ThumbnailArticleProps {
  article: Article;
  onOpen: () => void;
  variant?: 'card' | 'newspaper';
  showBorder?: boolean;
}

export const ThumbnailArticle: React.FC<ThumbnailArticleProps> = ({
  article,
  onOpen,
  variant = 'card',
  showBorder = true,
}) => {
  const { settings } = useSettings();
  const watchlistMatch = useMemo(
    () => checkWatchlistMatch(article, settings.watchlistKeywords),
    [article, settings.watchlistKeywords]
  );
  if (variant === 'newspaper') {
    return (
      <article
        onClick={onOpen}
        className={`group cursor-pointer flex flex-row gap-3 py-3 transition-all duration-200 ${
          showBorder ? 'border-b border-theme-border/60' : ''
        } ${article.read ? 'opacity-85' : 'opacity-100'}`}
      >
        {/* Compact Newspaper Thumbnail */}
        <div className="w-24 sm:w-28 h-20 flex-shrink-0 rounded-sm overflow-hidden border border-theme-border/40">
          <ArticleImage
            src={article.image}
            alt={article.title}
            sourceName={article.sourceName}
            category={article.categories[0] || 'Security'}
            aspectClass="h-full w-full"
          />
        </div>

        {/* Content */}
        <div className="flex flex-col flex-grow min-w-0 justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
              <div className="flex flex-wrap items-center gap-1">
                <SeverityBadge severity={article.severity} />
                <StackBadge article={article} />
                {watchlistMatch.matched && (
                  <WatchlistBadge terms={watchlistMatch.matchedTerms} />
                )}
                <span className="font-mono text-[10px] font-bold text-theme-accent uppercase truncate">
                  {article.sourceName}
                </span>
              </div>
              <time className="font-mono text-[10px] text-theme-text-muted flex-shrink-0">
                {formatRelativeTime(article.publishedAt)}
              </time>
            </div>
            <h4 className="font-serif text-sm sm:text-base font-bold text-theme-text group-hover:text-theme-accent transition-colors leading-snug line-clamp-2">
              {article.title}
            </h4>
          </div>

          <div className="flex items-center justify-between gap-1 pt-1 mt-1">
            <span className="font-mono text-[9px] uppercase px-1 rounded bg-theme-card text-theme-text-muted truncate max-w-[80px]">
              #{article.tags[0] || 'Intel'}
            </span>
            <ArticleActions article={article} compact onOpenReader={onOpen} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      onClick={onOpen}
      className={`group cursor-pointer flex flex-col sm:flex-row gap-4 p-4 rounded-lg bg-theme-surface border border-theme-border hover:border-theme-accent/50 transition-all duration-200 ${
        article.read ? 'opacity-85' : 'opacity-100 shadow-sm'
      }`}
    >
      {/* Thumbnail */}
      <div className="w-full sm:w-36 h-28 sm:h-24 flex-shrink-0 rounded overflow-hidden border border-theme-border/40">
        <ArticleImage
          src={article.image}
          alt={article.title}
          sourceName={article.sourceName}
          category={article.categories[0] || 'Security'}
          aspectClass="h-full w-full"
        />
      </div>

      {/* Content */}
      <div className="flex flex-col flex-grow min-w-0 justify-between">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div className="flex flex-wrap items-center gap-1.5 truncate">
              <SeverityBadge severity={article.severity} />
              <StackBadge article={article} />
              {watchlistMatch.matched && (
                <WatchlistBadge terms={watchlistMatch.matchedTerms} />
              )}
              <span className="font-mono text-xs font-semibold text-theme-accent truncate">
                {article.sourceName}
              </span>
              <span className="text-theme-border font-bold">·</span>
              <span className="font-mono text-[11px] text-theme-text-muted truncate">
                {article.categories[0] || 'Security'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!article.read && (
                <span className="w-2 h-2 rounded-full bg-theme-accent" />
              )}
              <time className="font-mono text-xs text-theme-text-muted">
                {formatRelativeTime(article.publishedAt)}
              </time>
            </div>
          </div>

          <h3 className="font-serif text-base sm:text-lg font-bold text-theme-text group-hover:text-theme-accent transition-colors leading-snug mb-1 line-clamp-2">
            {article.title}
          </h3>

          {article.description && (
            <p className="font-serif text-xs text-theme-text-muted line-clamp-1 mb-2">
              <EntityText text={article.description} context={article.title} />
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-theme-border/40">
          <div className="flex items-center gap-1 overflow-hidden">
            {article.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-theme-card text-theme-text-muted truncate"
              >
                #{tag}
              </span>
            ))}
          </div>
          <ArticleActions article={article} compact onOpenReader={onOpen} />
        </div>
      </div>
    </article>
  );
};
