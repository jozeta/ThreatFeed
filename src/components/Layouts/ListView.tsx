import React from 'react';
import { Article } from '../../types';
import { ListArticle } from '../ArticleCard/ListArticle';
import { EmptyState } from '../Common/EmptyState';
import { LoadMoreButton } from '../Common/LoadMoreButton';
import { usePagedCount } from '../../hooks/usePagedCount';

interface ListViewProps {
  articles: Article[];
  isLoading: boolean;
  onOpenArticle: (article: Article) => void;
}

export const ListView: React.FC<ListViewProps> = ({ articles, isLoading, onOpenArticle }) => {
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(articles.length, 60);

  if (articles.length === 0 && !isLoading) {
    return <EmptyState />;
  }

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="bg-theme-surface rounded-lg border border-theme-border overflow-hidden divide-y divide-theme-border/60">
        {articles.slice(0, visibleCount).map((article) => (
          <ListArticle
            key={article.id}
            article={article}
            onOpen={() => onOpenArticle(article)}
          />
        ))}
      </div>
      {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
    </div>
  );
};
