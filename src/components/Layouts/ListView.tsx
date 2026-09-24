import React from 'react';
import { Article } from '../../types';
import { ListArticle } from '../ArticleCard/ListArticle';
import { EmptyState } from '../Common/EmptyState';

interface ListViewProps {
  articles: Article[];
  isLoading: boolean;
  onOpenArticle: (article: Article) => void;
}

export const ListView: React.FC<ListViewProps> = ({ articles, isLoading, onOpenArticle }) => {
  if (articles.length === 0 && !isLoading) {
    return <EmptyState />;
  }

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="bg-theme-surface rounded-lg border border-theme-border overflow-hidden divide-y divide-theme-border/60">
        {articles.map((article) => (
          <ListArticle
            key={article.id}
            article={article}
            onOpen={() => onOpenArticle(article)}
          />
        ))}
      </div>
    </div>
  );
};
