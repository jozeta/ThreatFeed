import React, { useMemo } from 'react';
import { Article } from '../../types';
import { ArticleImage } from '../Common/ArticleImage';
import { ArticleActions } from '../Common/ArticleActions';
import { formatRelativeTime } from '../../utils/date';
import { SeverityBadge, WatchlistBadge } from '../Common/ThreatBadges';
import { checkWatchlistMatch } from '../../services/intelligence/watchlist';
import { useSettings } from '../../context/SettingsContext';

interface QuarterBriefArticleProps {
  article: Article;
  onOpen: () => void;
  withImage?: boolean;
}

export const QuarterBriefArticle: React.FC<QuarterBriefArticleProps> = ({
  article,
  onOpen,
  withImage = true,
}) => {
  const { settings } = useSettings();
  const watchlistMatch = useMemo(
    () => checkWatchlistMatch(article, settings.watchlistKeywords),
    [article, settings.watchlistKeywords]
  );

  return (
    <article
      onClick={onOpen}
      className={`group cursor-pointer flex flex-col h-full p-4 rounded-lg bg-theme-surface border border-theme-border hover:border-theme-accent/50 transition-all duration-200 ${
        article.read ? 'opacity-85' : 'opacity-100 shadow-sm'
      }`}
    >
      {withImage && (
        <div className="w-full mb-3 rounded overflow-hidden border border-theme-border/40">
          <ArticleImage
            src={article.image}
            alt={article.title}
            sourceName={article.sourceName}
            category={article.categories[0] || 'Security'}
            aspectClass="aspect-video max-h-36"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <SeverityBadge severity={article.severity} />
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

      <h4 className="font-serif text-sm sm:text-base font-bold text-theme-text group-hover:text-theme-accent transition-colors leading-snug mb-2 line-clamp-3">
        {article.title}
      </h4>

      {article.description && (
        <p className="font-serif text-xs text-theme-text-muted line-clamp-2 leading-relaxed mb-3">
          {article.description}
        </p>
      )}

      <div className="mt-auto pt-2 border-t border-theme-border/40 flex items-center justify-between gap-1">
        <span className="font-mono text-[9px] uppercase px-1 rounded bg-theme-card text-theme-text-muted truncate max-w-[80px]">
          {article.tags[0] ? `#${article.tags[0]}` : article.categories[0]}
        </span>
        <ArticleActions article={article} compact onOpenReader={onOpen} />
      </div>
    </article>
  );
};
