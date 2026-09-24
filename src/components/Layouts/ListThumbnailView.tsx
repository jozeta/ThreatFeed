import React from 'react';
import { Article } from '../../types';
import { ThumbnailArticle } from '../ArticleCard/ThumbnailArticle';
import { EmptyState } from '../Common/EmptyState';

interface ListThumbnailViewProps {
  articles: Article[];
  isLoading: boolean;
  onOpenArticle: (article: Article) => void;
}

export const ListThumbnailView: React.FC<ListThumbnailViewProps> = ({
  articles,
  isLoading,
  onOpenArticle,
}) => {
  if (articles.length === 0 && !isLoading) {
    return <EmptyState />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {articles.map((article) => (
        <ThumbnailArticle
          key={article.id}
          article={article}
          onOpen={() => onOpenArticle(article)}
        />
      ))}
    </div>
  );
};
