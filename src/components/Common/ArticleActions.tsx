import React, { useState } from 'react';
import { Article } from '../../types';
import { useFeeds } from '../../context/FeedContext';
import { Bookmark, Check, Share2, ExternalLink, Eye } from 'lucide-react';

interface ArticleActionsProps {
  article: Article;
  onOpenReader?: () => void;
  compact?: boolean;
}

export const ArticleActions: React.FC<ArticleActionsProps> = ({ article, onOpenReader, compact = false }) => {
  const { toggleBookmark, toggleRead } = useFeeds();
  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.description || article.title,
          url: article.url,
        });
        return;
      } catch {
        // User cancelled or share failed, fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(article.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleBookmark(article.id);
  };

  const handleToggleRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleRead(article.id);
  };

  const handleExternalOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(article.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'} text-theme-text-muted`}>
      {/* Read Status Toggle */}
      <button
        onClick={handleToggleRead}
        title={article.read ? 'Mark as unread' : 'Mark as read'}
        aria-label={article.read ? 'Mark as unread' : 'Mark as read'}
        className={`p-1.5 rounded hover:bg-theme-card transition-colors ${
          article.read ? 'text-theme-text-muted hover:text-theme-text' : 'text-theme-accent font-medium'
        }`}
      >
        <Check className={`w-3.5 h-3.5 ${article.read ? 'opacity-40' : 'opacity-100 stroke-[2.5]'}`} />
      </button>

      {/* Bookmark */}
      <button
        onClick={handleBookmark}
        title={article.bookmarked ? 'Remove bookmark' : 'Bookmark article'}
        aria-label={article.bookmarked ? 'Remove bookmark' : 'Bookmark article'}
        className={`p-1.5 rounded hover:bg-theme-card transition-colors ${
          article.bookmarked ? 'text-theme-accent fill-current' : 'text-theme-text-muted hover:text-theme-text'
        }`}
      >
        <Bookmark className={`w-3.5 h-3.5 ${article.bookmarked ? 'fill-theme-accent' : ''}`} />
      </button>

      {/* Share / Copy */}
      <button
        onClick={handleShare}
        title={copied ? 'Link copied!' : 'Share article'}
        aria-label="Share article"
        className="p-1.5 rounded hover:bg-theme-card text-theme-text-muted hover:text-theme-text transition-colors relative"
      >
        {copied ? (
          <span className="text-[10px] font-mono text-emerald-500 font-bold px-1">COPIED</span>
        ) : (
          <Share2 className="w-3.5 h-3.5" />
        )}
      </button>

      {/* External Link */}
      <button
        onClick={handleExternalOpen}
        title="Open original website"
        aria-label="Open original website"
        className="p-1.5 rounded hover:bg-theme-card text-theme-text-muted hover:text-theme-text transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </button>

      {/* Reader trigger if needed */}
      {onOpenReader && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenReader();
          }}
          title="Open in Reader view"
          aria-label="Open in Reader view"
          className="p-1.5 rounded hover:bg-theme-card text-theme-text-muted hover:text-theme-accent transition-colors ml-auto flex items-center gap-1 font-mono text-[11px]"
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">READ</span>
        </button>
      )}
    </div>
  );
};
