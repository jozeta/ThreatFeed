import React from 'react';
import { Article } from '../../types';
import { ArticleActions } from '../Common/ArticleActions';
import { formatRelativeTime } from '../../utils/date';

interface ListArticleProps {
  article: Article;
  onOpen: () => void;
}

export const ListArticle: React.FC<ListArticleProps> = ({ article, onOpen }) => {
  return (
    <article
      onClick={onOpen}
      className={`group cursor-pointer flex items-center justify-between gap-3 px-4 py-3 border-b border-theme-border/60 hover:bg-theme-surface/80 transition-colors ${
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
        </div>

        {/* Source & Category */}
        <div className="hidden md:flex items-center gap-2 text-xs font-mono text-theme-text-muted flex-shrink-0 max-w-[200px] truncate">
          <span className="text-theme-accent truncate">{article.sourceName}</span>
          <span className="text-theme-border">·</span>
          <span className="truncate">{article.categories[0] || 'Security'}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0">
        <ArticleActions article={article} compact onOpenReader={onOpen} />
      </div>
    </article>
  );
};
