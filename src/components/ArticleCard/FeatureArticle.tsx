import React from 'react';
import { Article } from '../../types';
import { ArticleImage } from '../Common/ArticleImage';
import { ArticleActions } from '../Common/ArticleActions';
import { formatRelativeTime } from '../../utils/date';

interface FeatureArticleProps {
  article: Article;
  onOpen: () => void;
  orientation?: 'vertical' | 'horizontal';
  showBorder?: boolean;
  className?: string;
}

export const FeatureArticle: React.FC<FeatureArticleProps> = ({
  article,
  onOpen,
  orientation = 'vertical',
  showBorder = true,
  className = '',
}) => {
  return (
    <article
      onClick={onOpen}
      className={`group cursor-pointer flex transition-all duration-200 ${
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
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-theme-accent font-semibold truncate">
            {article.sourceName}
          </span>
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
            {article.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1 overflow-hidden">
            {article.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-theme-card text-theme-text-muted truncate max-w-[120px]"
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
