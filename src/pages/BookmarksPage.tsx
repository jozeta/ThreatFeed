import React, { useState } from 'react';
import { Article } from '../types';
import { useFeeds } from '../context/FeedContext';
import { ThumbnailArticle } from '../components/ArticleCard/ThumbnailArticle';
import { Bookmark, Search, X, Download } from 'lucide-react';

interface BookmarksPageProps {
  onOpenArticle: (article: Article) => void;
}

export const BookmarksPage: React.FC<BookmarksPageProps> = ({ onOpenArticle }) => {
  const { articles } = useFeeds();
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Filter bookmarked articles
  const savedArticles = articles.filter((a) => a.bookmarked);

  // Collect all unique tags from bookmarked articles
  const bookmarkTags = Array.from(
    new Set(savedArticles.flatMap((a) => [...a.tags, ...(a.customTags || [])]))
  );

  // Apply search & tag filter
  const filtered = savedArticles.filter((article) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matches =
        article.title.toLowerCase().includes(q) ||
        (article.description && article.description.toLowerCase().includes(q)) ||
        article.sourceName.toLowerCase().includes(q);
      if (!matches) return false;
    }

    if (selectedTag) {
      const hasTag =
        article.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase()) ||
        (article.customTags && article.customTags.some((t) => t.toLowerCase() === selectedTag.toLowerCase()));
      if (!hasTag) return false;
    }

    return true;
  });

  const handleExportBookmarks = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(savedArticles, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `threatfeed-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-theme-border">
        <div>
          <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
            <Bookmark className="w-6 h-6 text-theme-accent fill-theme-accent" />
            <span>Saved Intelligence & Research</span>
          </h1>
          <p className="font-serif text-sm text-theme-text-muted mt-1">
            {savedArticles.length} bookmarked security advisories, exploit writeups, and threat reports.
          </p>
        </div>

        {savedArticles.length > 0 && (
          <button
            onClick={handleExportBookmarks}
            className="px-3 py-2 rounded bg-theme-card border border-theme-border text-theme-text hover:border-theme-accent transition-colors font-mono text-xs flex items-center gap-1.5 self-start md:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Bookmarks JSON</span>
          </button>
        )}
      </div>

      {savedArticles.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-theme-surface border border-theme-border flex items-center justify-center mx-auto mb-4 text-theme-text-muted">
            <Bookmark className="w-8 h-8 opacity-40" />
          </div>
          <h3 className="font-serif text-xl font-bold text-theme-text mb-2">
            No saved articles yet
          </h3>
          <p className="font-serif text-sm text-theme-text-muted max-w-md mx-auto">
            Click the bookmark icon or press <kbd className="font-mono text-xs px-1.5 py-0.5 rounded bg-theme-card border border-theme-border text-theme-accent font-bold">b</kbd> while reading any security article to save it for reference.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Search & Tag Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-grow max-w-md">
              <Search className="w-4 h-4 text-theme-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search saved articles..."
                className="w-full pl-9 pr-8 py-2 text-xs font-mono bg-theme-card border border-theme-border rounded-md text-theme-text focus:outline-none focus:border-theme-accent"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-text-muted hover:text-theme-text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {bookmarkTags.length > 0 && (
              <div className="flex flex-wrap gap-1 items-center">
                <span className="font-mono text-xs text-theme-text-muted mr-1">Tags:</span>
                {bookmarkTags.slice(0, 6).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={`font-mono text-xs px-2 py-1 rounded transition-colors ${
                      selectedTag === tag
                        ? 'bg-theme-accent text-white font-bold'
                        : 'bg-theme-surface text-theme-text-muted border border-theme-border hover:text-theme-text'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bookmarks List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((article) => (
              <ThumbnailArticle
                key={article.id}
                article={article}
                onOpen={() => onOpenArticle(article)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
