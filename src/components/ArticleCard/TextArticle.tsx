import React from 'react';
import { Article } from '../../types';
import { ArticleActions } from '../Common/ArticleActions';
import { formatRelativeTime } from '../../utils/date';

interface TextArticleProps {
  article: Article;
  onOpen: () => void;
  showDivider?: boolean;
}

export const TextArticle: React.FC<TextArticleProps> = ({
  article,
  onOpen,
  showDivider = true,
}) => {
  return (
    <article
      onClick={onOpen}
      className={`group cursor-pointer flex flex-col transition-all duration-200 ${
        showDivider ? 'border-b border-theme-border/70 pb-4 mb-4' : 'pb-2'
      } ${article.read ? 'opacity-80' : 'opacity-100'}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-mono text-[10px] font-semibold text-theme-accent uppercase tracking-wider truncate">
          {article.sourceName}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!article.read && (
            <span className="w-1.5 h-1.5 rounded-full bg-theme-accent" />
          )}
          <time className="font-mono text-[11px] text-theme-text-muted">
            {formatRelativeTime(article.publishedAt)}
          </time>
        </div>
      </div>

      <h4 className="font-serif text-base sm:text-lg font-semibold text-theme-text group-hover:text-theme-accent transition-colors leading-snug mb-1.5">
        {article.title}
      </h4>

      {article.description && (
        <p className="font-serif text-xs sm:text-sm text-theme-text-muted leading-relaxed line-clamp-2 mb-2">
          {article.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 overflow-hidden">
          {article.tags.slice(0, 2).map((tag) => (
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
    </article>
  );
};
