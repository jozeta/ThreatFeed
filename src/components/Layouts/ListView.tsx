import React from 'react';
import { Article } from '../../types';
import { ListArticle } from '../ArticleCard/ListArticle';
import { EmptyState } from '../Common/EmptyState';
import { EarlierDivider } from '../Common/EarlierDivider';
import { LoadMoreButton } from '../Common/LoadMoreButton';
import { usePagedCount } from '../../hooks/usePagedCount';

interface ListViewProps {
  articles: Article[];
  isLoading: boolean;
  onOpenArticle: (article: Article) => void;
  /** Latest only: id of the first article from before the last visit (an "Earlier" divider goes above it) */
  earlierId?: string | null;
}

export const ListView: React.FC<ListViewProps> = ({ articles, isLoading, onOpenArticle, earlierId }) => {
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(articles.length, 60);

  if (articles.length === 0 && !isLoading) {
    return <EmptyState />;
  }

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="bg-theme-surface rounded-lg border border-theme-border overflow-hidden divide-y divide-theme-border/60">
        {articles.slice(0, visibleCount).map((article) => (
          <React.Fragment key={article.id}>
            {article.id === earlierId && <EarlierDivider className="px-4 py-2" />}
            <ListArticle article={article} onOpen={() => onOpenArticle(article)} />
          </React.Fragment>
        ))}
      </div>
      {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
    </div>
  );
};
