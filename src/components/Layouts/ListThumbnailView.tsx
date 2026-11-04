import React from 'react';
import { Article } from '../../types';
import { ThumbnailArticle } from '../ArticleCard/ThumbnailArticle';
import { EmptyState } from '../Common/EmptyState';
import { EarlierDivider } from '../Common/EarlierDivider';
import { LoadMoreButton } from '../Common/LoadMoreButton';
import { usePagedCount } from '../../hooks/usePagedCount';

interface ListThumbnailViewProps {
  articles: Article[];
  isLoading: boolean;
  onOpenArticle: (article: Article) => void;
  /** Latest only: id of the first article from before the last visit (an "Earlier" divider goes above it) */
  earlierId?: string | null;
}

export const ListThumbnailView: React.FC<ListThumbnailViewProps> = ({
  articles,
  isLoading,
  onOpenArticle,
  earlierId,
}) => {
  const { visibleCount, hasMore, remaining, showMore } = usePagedCount(articles.length, 30);

  if (articles.length === 0 && !isLoading) {
    return <EmptyState />;
  }

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {articles.slice(0, visibleCount).map((article) => (
        <React.Fragment key={article.id}>
          {article.id === earlierId && <EarlierDivider />}
          <ThumbnailArticle article={article} onOpen={() => onOpenArticle(article)} />
        </React.Fragment>
      ))}
      {hasMore && <LoadMoreButton remaining={remaining} onClick={showMore} />}
    </div>
  );
};
