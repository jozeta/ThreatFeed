import React, { useEffect, useState } from 'react';
import { Article } from '../../types';
import { useFeeds } from '../../context/FeedContext';
import { formatFullDateTime } from '../../utils/date';
import { ArticleImage } from '../Common/ArticleImage';
import {
  X,
  ExternalLink,
  Bookmark,
  Check,
  Share2,
  Printer,
  ChevronLeft,
  ChevronRight,
  Plus,
  Shield,
  Tag as TagIcon
} from 'lucide-react';

interface ReaderModalProps {
  article: Article;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export const ReaderModal: React.FC<ReaderModalProps> = ({
  article,
  onClose,
  onNext,
  onPrev,
  hasNext = false,
  hasPrev = false,
}) => {
  const { toggleBookmark, toggleRead, markViewed, addCustomTagToArticle } = useFeeds();
  const [newTagInput, setNewTagInput] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);
  const [copied, setCopied] = useState(false);

  // Automatically mark as viewed and read when opened
  useEffect(() => {
    markViewed(article.id);
  }, [article.id, markViewed]);

  // Handle escape and keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'j') {
        if (hasNext && onNext) onNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'k') {
        if (hasPrev && onPrev) onPrev();
      } else if (e.key === 'b') {
        toggleBookmark(article.id);
      } else if (e.key === 'm') {
        toggleRead(article.id);
      } else if (e.key === 'o') {
        window.open(article.url, '_blank', 'noopener,noreferrer');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [article.id, hasNext, hasPrev, onNext, onPrev, onClose, toggleBookmark, toggleRead]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.description || article.title,
          url: article.url,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(article.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTagInput.trim()) {
      addCustomTagToArticle(article.id, newTagInput.trim());
      setNewTagInput('');
      setShowAddTag(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex justify-center p-0 sm:p-4 md:p-6 animate-fadeIn">
      {/* Background click overlay */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Reader Modal Sheet */}
      <div
        className="relative bg-theme-surface w-full max-w-4xl min-h-screen sm:min-h-0 sm:rounded-xl shadow-2xl border border-theme-border flex flex-col z-10 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <header className="sticky top-0 z-20 bg-theme-surface/95 backdrop-blur-md border-b border-theme-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-theme-accent uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              {article.sourceName}
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Previous / Next buttons */}
            <div className="flex items-center border border-theme-border/70 rounded mr-2">
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                title="Previous article (k or ←)"
                className="p-1.5 hover:bg-theme-card text-theme-text-muted hover:text-theme-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="w-[1px] h-4 bg-theme-border/70" />
              <button
                onClick={onNext}
                disabled={!hasNext}
                title="Next article (j or →)"
                className="p-1.5 hover:bg-theme-card text-theme-text-muted hover:text-theme-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Read / Unread */}
            <button
              onClick={() => toggleRead(article.id)}
              title={article.read ? 'Mark as unread (m)' : 'Mark as read (m)'}
              className={`p-2 rounded hover:bg-theme-card transition-colors ${
                article.read ? 'text-theme-text-muted' : 'text-theme-accent'
              }`}
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
            </button>

            {/* Bookmark */}
            <button
              onClick={() => toggleBookmark(article.id)}
              title="Bookmark article (b)"
              className={`p-2 rounded hover:bg-theme-card transition-colors ${
                article.bookmarked ? 'text-theme-accent fill-current' : 'text-theme-text-muted'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${article.bookmarked ? 'fill-theme-accent' : ''}`} />
            </button>

            {/* Share */}
            <button
              onClick={handleShare}
              title={copied ? 'Link copied!' : 'Share article'}
              className="p-2 rounded hover:bg-theme-card text-theme-text-muted hover:text-theme-text transition-colors"
            >
              {copied ? <span className="font-mono text-[10px] text-emerald-500 font-bold">COPIED</span> : <Share2 className="w-4 h-4" />}
            </button>

            {/* Print */}
            <button
              onClick={handlePrint}
              title="Print article"
              className="p-2 rounded hover:bg-theme-card text-theme-text-muted hover:text-theme-text transition-colors hidden sm:inline-flex"
            >
              <Printer className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              title="Close reader (Esc)"
              className="p-2 rounded hover:bg-theme-card text-theme-text-muted hover:text-theme-text transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Reader Content Body */}
        <article className="p-6 sm:p-10 flex-grow max-w-3xl mx-auto w-full">
          {/* Metadata banner */}
          <div className="flex flex-wrap items-center gap-2 mb-4 text-xs font-mono text-theme-text-muted pb-3 border-b border-theme-border/60">
            <span className="text-theme-accent font-bold uppercase tracking-wider">
              {article.sourceName}
            </span>
            <span>·</span>
            <time>{formatFullDateTime(article.publishedAt)}</time>
            {article.author && (
              <>
                <span>·</span>
                <span>By <strong className="text-theme-text font-medium">{article.author}</strong></span>
              </>
            )}
            <span className="ml-auto px-2 py-0.5 rounded bg-theme-card text-[11px] font-semibold text-theme-text-muted">
              {article.categories[0] || 'Security Report'}
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-serif text-2xl sm:text-4xl font-extrabold text-theme-text leading-tight mb-6">
            {article.title}
          </h1>

          {/* Hero Image */}
          {article.image && (
            <div className="mb-8 rounded-lg overflow-hidden border border-theme-border/60">
              <ArticleImage
                src={article.image}
                alt={article.title}
                sourceName={article.sourceName}
                category={article.categories[0] || 'Security'}
                aspectClass="aspect-[16/9] max-h-[460px]"
              />
            </div>
          )}

          {/* Primary Action Button: Read Original Article */}
          <div className="mb-8 p-4 rounded-lg bg-theme-accent-subtle/40 border border-theme-accent/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-left">
              <h4 className="font-serif text-base font-bold text-theme-text">Read full dispatch at source</h4>
              <p className="text-xs text-theme-text-muted mt-0.5">
                Published by {article.sourceName}
              </p>
            </div>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-5 py-2.5 rounded font-mono text-xs font-bold uppercase tracking-wider bg-theme-accent text-white hover:bg-theme-accent-hover transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <span>Read Original Article</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Article Summary or Content */}
          <div className="prose prose-slate dark:prose-invert max-w-none font-serif text-base sm:text-lg text-theme-text/90 leading-relaxed space-y-4 mb-8">
            {article.content ? (
              <div
                dangerouslySetInnerHTML={{ __html: article.content }}
                className="space-y-4 overflow-x-auto break-words reader-html-content"
              />
            ) : (
              <p className="whitespace-pre-line leading-relaxed">
                {article.description}
              </p>
            )}
          </div>

          {/* Tags & Custom Tag Adder */}
          <div className="pt-6 border-t border-theme-border">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <TagIcon className="w-4 h-4 text-theme-text-muted" />
              <span className="font-mono text-xs text-theme-text-muted uppercase tracking-wider">
                THREAT TAGS:
              </span>
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded bg-theme-card text-theme-text border border-theme-border"
                >
                  #{tag}
                </span>
              ))}

              {/* User Custom Tags */}
              {article.customTags && article.customTags.map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded bg-theme-accent-subtle text-theme-accent border border-theme-accent/30 font-semibold"
                >
                  +{tag}
                </span>
              ))}

              {/* Add Custom Tag Form */}
              {showAddTag ? (
                <form onSubmit={handleAddTagSubmit} className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="tag name..."
                    autoFocus
                    className="font-mono text-xs px-2 py-0.5 bg-theme-card border border-theme-accent rounded text-theme-text focus:outline-none w-28"
                  />
                  <button
                    type="submit"
                    className="font-mono text-xs px-2 py-0.5 bg-theme-accent text-white rounded font-bold"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddTag(false)}
                    className="text-theme-text-muted hover:text-theme-text text-xs px-1"
                  >
                    ×
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setShowAddTag(true)}
                  className="font-mono text-xs px-2 py-0.5 rounded border border-dashed border-theme-border hover:border-theme-accent text-theme-text-muted hover:text-theme-accent transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add tag</span>
                </button>
              )}
            </div>
          </div>
        </article>

        {/* Footer sticky toolbar */}
        <footer className="sticky bottom-0 bg-theme-surface/95 backdrop-blur-md border-t border-theme-border px-6 py-3 flex items-center justify-between text-xs font-mono text-theme-text-muted">
          <span>Shortcuts: [j/k] next/prev · [m] read · [b] bookmark · [o] open</span>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-theme-accent hover:underline flex items-center gap-1 font-semibold"
          >
            <span>{article.sourceName}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </footer>
      </div>
    </div>
  );
};
