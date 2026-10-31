import React, { useMemo } from 'react';
import { EntityText } from '../EntityText';
import { TagChip } from '../TagChip';
import { Article } from '../../types';
import { ArticleActions } from '../Common/ArticleActions';
import { formatRelativeTime } from '../../utils/date';
import { SeverityBadge, WatchlistBadge, StackBadge } from '../Common/ThreatBadges';
import { checkWatchlistMatch } from '../../services/intelligence/watchlist';
import { useSettings } from '../../context/SettingsContext';

interface TextArticleProps {
  article: Article;
  onOpen: () => void;
  showDivider?: boolean;
  className?: string;
  /** A brief: severity, source · age, a two-line headline and one summary line; no tags or actions */
  compact?: boolean;
}

export const TextArticle: React.FC<TextArticleProps> = ({
  article,
  onOpen,
  showDivider = true,
  className = '',
  compact = false,
}) => {
  const { settings } = useSettings();
  const watchlistMatch = useMemo(
    () => checkWatchlistMatch(article, settings.watchlistKeywords),
    [article, settings.watchlistKeywords]
  );

  return (
    <article
      onClick={onOpen}
      // A compact brief has no actions row (with its "open in reader" button), so the brief itself opens by keyboard;
      // the focus ring is inset because a filler clips what sticks out of it
      {...(compact && {
        role: 'button',
        tabIndex: 0,
        'aria-label': article.title,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
          e.preventDefault();
          onOpen();
        },
      })}
      className={`lift-flat group cursor-pointer flex flex-col ${compact ? 'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-theme-accent' : ''} ${
        showDivider ? 'border-b border-theme-border/70 pb-4 mb-4' : 'pb-2'
      } ${article.read ? 'opacity-80' : 'opacity-100'} ${className}`}
    >
      <div className={`flex items-center justify-between gap-1 mb-1 ${compact ? 'min-w-0' : 'flex-wrap'}`}>
        <div className={`flex items-center gap-1 ${compact ? 'min-w-0' : 'flex-wrap'}`}>
          <SeverityBadge severity={article.severity} />
          {!compact && <StackBadge article={article} />}
          {!compact && watchlistMatch.matched && (
            <WatchlistBadge terms={watchlistMatch.matchedTerms} />
          )}
          <span className="font-mono text-[10px] font-semibold text-theme-accent uppercase tracking-wider truncate">
            {article.sourceName}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!article.read && (
            <span className="w-1.5 h-1.5 rounded-full bg-theme-accent" />
          )}
          <time className="font-mono text-[11px] text-theme-text-muted">
            {formatRelativeTime(article.publishedAt)}
          </time>
        </div>
      </div>

      <h4 className={`font-serif font-semibold text-theme-text group-hover:text-theme-accent transition-colors leading-snug mb-1.5 ${
        compact ? 'text-base line-clamp-2' : 'text-base sm:text-lg'
      }`}>
        {article.title}
      </h4>

      {article.description && (
        <p className={`font-serif text-xs sm:text-sm text-theme-text-muted leading-relaxed ${compact ? 'line-clamp-1' : 'line-clamp-2 mb-2'}`}>
          <EntityText text={article.description} context={article.title} />
        </p>
      )}

      {!compact && <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 overflow-hidden">
          {article.tags.slice(0, 2).map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-theme-card text-theme-text-muted truncate hover:text-theme-accent"
            >
              #{tag}
            </TagChip>
          ))}
        </div>
        <ArticleActions article={article} compact onOpenReader={onOpen} />
      </div>}
    </article>
  );
};
