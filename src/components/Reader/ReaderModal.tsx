import React, { useEffect, useState, useMemo } from 'react';
import { Article } from '../../types';
import { useFeeds } from '../../context/FeedContext';
import { useSettings } from '../../context/SettingsContext';
import { formatFullDateTime } from '../../utils/date';
import { ArticleImage } from '../Common/ArticleImage';
import { SeverityBadge, WatchlistBadge, CveChip, StackBadge } from '../Common/ThreatBadges';
import { downloadText, iocsToCsv, iocsToStix } from '../../services/intelligence/iocExport';
import { extractIOCs } from '../../services/intelligence/iocExtractor';
import { iocLookupLinks } from '../../services/intelligence/iocLinks';
import { checkWatchlistMatch } from '../../services/intelligence/watchlist';
import { sanitizeHtml } from '../../services/rss/sanitizer';
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
  Tag as TagIcon,
  Folder,
  Copy,
  Terminal,
  FileText
} from 'lucide-react';

// A copy/CVE chip followed by small lookup chips (VirusTotal, GreyNoise, ...); in-app links stay in the tab
const IocWithLookups: React.FC<{ lookups: { label: string; url: string }[]; onNavigate?: () => void; children: React.ReactNode }> = ({ lookups, onNavigate, children }) => (
  <span className="inline-flex flex-wrap items-center gap-1">
    {children}
    {lookups.map((l) => {
      const inApp = l.url.startsWith('#');
      return (
        <a
          key={l.label}
          href={l.url}
          {...(inApp ? { onClick: onNavigate } : { target: '_blank', rel: 'noopener noreferrer' })}
          title={`Look up on ${l.label}`}
          className="px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide text-theme-text-muted hover:text-theme-accent border border-theme-border hover:border-theme-accent/50 transition-colors"
        >
          {l.label}
        </a>
      );
    })}
  </span>
);

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
  const { feeds, toggleBookmark, toggleRead, markViewed, addCustomTagToArticle, setBookmarkFolder, setBookmarkNotes } = useFeeds();
  const { settings, updateSettings } = useSettings();
  const [newTagInput, setNewTagInput] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedIOCs, setCopiedIOCs] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState(article.bookmarkNotes || '');

  const extractedIOCs = useMemo(() => {
    return extractIOCs(`${article.title} ${article.description || ''} ${article.content || ''}`);
  }, [article]);

  // Content is sanitized at ingest; sanitizing again at render is cheap insurance for raw HTML
  const safeContent = useMemo(() => sanitizeHtml(article.content || ''), [article.content]);

  // Feber feeds (and any feed tagged "swedish") get a one-click English translation
  const isSwedish = useMemo(
    () => feeds.find((f) => f.id === article.sourceId)?.tags?.includes('swedish') ?? false,
    [feeds, article.sourceId]
  );
  const iocFileStem = `iocs-${article.sourceId}-${article.publishedAt.slice(0, 10)}`;

  const watchlistMatch = useMemo(() => {
    return checkWatchlistMatch(article, settings.watchlistKeywords);
  }, [article, settings.watchlistKeywords]);

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
      // Leave browser/OS shortcuts (e.g. Cmd/Ctrl+B, Cmd/Ctrl+O) alone
      if (e.metaKey || e.ctrlKey || e.altKey) {
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

  const handleCopyAllIOCs = () => {
    if (extractedIOCs.length === 0) return;
    const lines = [
      `# ThreatFeed IOC Export: ${article.title}`,
      `# Source: ${article.sourceName} (${article.url})`,
      `# Timestamp: ${new Date().toISOString()}`,
      '',
      ...extractedIOCs.map(i => `${i.type.toUpperCase().padEnd(12)}: ${i.value}`)
    ].join('\n');
    navigator.clipboard.writeText(lines);
    setCopiedIOCs(true);
    setTimeout(() => setCopiedIOCs(false), 2000);
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
    <div className="fixed inset-0 z-50 overflow-y-auto modal-backdrop flex justify-center p-0 sm:p-4 md:p-6 animate-fadeIn">
      {/* Background click overlay */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Reader Modal Sheet */}
      <div
        className="relative modal-glass w-full max-w-4xl min-h-screen sm:min-h-0 sm:rounded-xl flex flex-col z-10 overflow-hidden my-auto"
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

            {/* Bookmark & Folder assignment */}
            <div className="relative flex items-center">
              <button
                onClick={() => toggleBookmark(article.id)}
                title="Bookmark article (b)"
                className={`p-2 rounded hover:bg-theme-card transition-colors ${
                  article.bookmarked ? 'text-theme-accent fill-current' : 'text-theme-text-muted'
                }`}
              >
                <Bookmark className={`w-4 h-4 ${article.bookmarked ? 'fill-theme-accent' : ''}`} />
              </button>

              {article.bookmarked && (
                <div className="relative">
                  <button
                    onClick={() => setShowFolderMenu(!showFolderMenu)}
                    title="Change Bookmark Folder"
                    className="ml-1 px-2 py-1 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-[11px] font-mono flex items-center gap-1 text-theme-text transition-colors"
                  >
                    <Folder className="w-3 h-3 text-theme-accent" />
                    <span className="truncate max-w-[85px]">{article.bookmarkFolder || 'General'}</span>
                  </button>

                  {showFolderMenu && (
                    <div className="absolute right-0 top-full mt-1.5 w-52 rounded-lg bg-theme-surface border border-theme-border shadow-xl p-2 z-30 font-mono text-xs">
                      <div className="text-[10px] uppercase font-bold text-theme-text-muted px-2 py-1">Assign Folder</div>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {settings.bookmarkFolders.map(f => (
                          <button
                            key={f}
                            onClick={() => {
                              setBookmarkFolder(article.id, f);
                              setShowFolderMenu(false);
                            }}
                            className={`w-full text-left px-2 py-1 rounded flex items-center justify-between transition-colors ${
                              (article.bookmarkFolder || 'General') === f
                                ? 'bg-theme-accent text-white font-bold'
                                : 'text-theme-text hover:bg-theme-card'
                            }`}
                          >
                            <span className="truncate">{f}</span>
                            {(article.bookmarkFolder || 'General') === f && <Check className="w-3 h-3" />}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-theme-border/60 flex items-center gap-1">
                        <input
                          type="text"
                          value={newFolderInput}
                          onChange={(e) => setNewFolderInput(e.target.value)}
                          placeholder="New folder..."
                          className="px-2 py-1 bg-theme-card border border-theme-border rounded text-[11px] text-theme-text focus:outline-none flex-grow"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const trimmed = newFolderInput.trim();
                              if (trimmed) {
                                if (!settings.bookmarkFolders.includes(trimmed)) {
                                  updateSettings({ bookmarkFolders: [...settings.bookmarkFolders, trimmed] });
                                }
                                setBookmarkFolder(article.id, trimmed);
                                setNewFolderInput('');
                                setShowFolderMenu(false);
                              }
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            const trimmed = newFolderInput.trim();
                            if (trimmed) {
                              if (!settings.bookmarkFolders.includes(trimmed)) {
                                updateSettings({ bookmarkFolders: [...settings.bookmarkFolders, trimmed] });
                              }
                              setBookmarkFolder(article.id, trimmed);
                              setNewFolderInput('');
                              setShowFolderMenu(false);
                            }
                          }}
                          className="p-1 rounded bg-theme-accent text-white font-bold"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

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
            <SeverityBadge severity={article.severity} score={article.severityScore} showScore={true} />
            {watchlistMatch.matched && (
              <WatchlistBadge terms={watchlistMatch.matchedTerms} />
            )}
            <StackBadge article={article} />
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

          {/* Watchlist Alert Banner */}
          {watchlistMatch.matched && (
            <div className="mb-5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs font-mono text-amber-600 dark:text-amber-300">
              <span className="font-bold uppercase tracking-wider">🎯 Watchlist Alert:</span>
              <span>Matched target keyword(s): <strong>{watchlistMatch.matchedTerms.join(', ')}</strong></span>
            </div>
          )}

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
            {isSwedish && article.url && (
              <a
                href={`https://translate.google.com/translate?sl=sv&tl=en&u=${encodeURIComponent(article.url)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-4 py-2.5 rounded font-mono text-xs font-bold uppercase tracking-wider bg-theme-surface border border-theme-border text-theme-text hover:border-theme-accent transition-colors flex items-center justify-center gap-2"
              >
                <span>Translate to English</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {/* Extracted IOCs & CVEs Drawer */}
          {extractedIOCs.length > 0 && (
            <div className="mb-8 rounded-lg bg-theme-card/60 border border-theme-border p-4 font-mono text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-theme-border/60">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-theme-accent" />
                  <span className="font-bold text-theme-text uppercase tracking-wider">
                    Extracted Threat Indicators & Disclosed CVEs ({extractedIOCs.length})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCopyAllIOCs}
                    className="px-2.5 py-1 rounded bg-theme-surface hover:bg-theme-card border border-theme-border text-theme-text text-[11px] flex items-center gap-1.5 transition-colors font-mono"
                  >
                    {copiedIOCs ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedIOCs ? 'Copied All IOCs' : 'Copy All IOCs'}</span>
                  </button>
                  <button
                    onClick={() => downloadText(`${iocFileStem}.csv`, iocsToCsv(extractedIOCs, article), 'text/csv')}
                    title="Download indicators as CSV"
                    className="px-2.5 py-1 rounded bg-theme-surface hover:bg-theme-card border border-theme-border text-theme-text text-[11px] transition-colors font-mono"
                  >
                    CSV
                  </button>
                  <button
                    onClick={() => downloadText(`${iocFileStem}.stix.json`, iocsToStix(extractedIOCs, article), 'application/json')}
                    title="Download a STIX 2.1 bundle for import into a SIEM / threat intel platform"
                    className="px-2.5 py-1 rounded bg-theme-surface hover:bg-theme-card border border-theme-border text-theme-text text-[11px] transition-colors font-mono"
                  >
                    STIX
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                {extractedIOCs.map((ioc, idx) => {
                  const lookups = iocLookupLinks(ioc);
                  if (ioc.type === 'cve') {
                    return <IocWithLookups key={idx} lookups={lookups} onNavigate={onClose}><CveChip cve={ioc.value} /></IocWithLookups>;
                  }
                  if (ioc.type === 'mitre') {
                    return (
                      <a
                        key={idx}
                        href={lookups[0].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Inspect ${ioc.value} on MITRE ATT&CK`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/25 transition-colors"
                      >
                        <span>ATT&CK: {ioc.value}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                      </a>
                    );
                  }
                  return (
                    <IocWithLookups key={idx} lookups={lookups}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(ioc.value);
                        }}
                        title={`Click to copy ${ioc.type}: ${ioc.value}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-theme-surface hover:bg-theme-card text-theme-text-muted hover:text-theme-text border border-theme-border transition-colors"
                      >
                        <span className="opacity-60">{ioc.type === 'ipv4' ? 'IP:' : 'HASH:'}</span>
                        <span>{ioc.value.length > 20 ? `${ioc.value.slice(0, 10)}...${ioc.value.slice(-6)}` : ioc.value}</span>
                        <Copy className="w-2.5 h-2.5 opacity-50" />
                      </button>
                    </IocWithLookups>
                  );
                })}
              </div>
            </div>
          )}

          {/* Article Summary or Content */}
          <div className="prose prose-slate dark:prose-invert max-w-none font-serif text-base sm:text-lg text-theme-text/90 leading-relaxed space-y-4 mb-8">
            {article.content ? (
              <div
                dangerouslySetInnerHTML={{ __html: safeContent }}
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

          {/* Analyst Notes Section */}
          <div className="mt-6 pt-6 border-t border-theme-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-mono text-xs text-theme-text-muted uppercase tracking-wider">
                <FileText className="w-4 h-4 text-theme-accent" />
                <span>Analyst Notes & Assessment</span>
              </div>
              {!isEditingNotes && (
                <button
                  onClick={() => setIsEditingNotes(true)}
                  className="text-xs font-mono text-theme-accent hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>{article.bookmarkNotes ? 'Edit Notes' : 'Add Note'}</span>
                </button>
              )}
            </div>

            {isEditingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Record private investigation notes, triage findings, or internal CVE context..."
                  rows={3}
                  className="w-full p-2.5 rounded bg-theme-card border border-theme-border focus:border-theme-accent text-xs font-mono text-theme-text focus:outline-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setNotesInput(article.bookmarkNotes || '');
                      setIsEditingNotes(false);
                    }}
                    className="px-3 py-1 rounded text-xs font-mono text-theme-text-muted hover:text-theme-text"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setBookmarkNotes(article.id, notesInput.trim());
                      setIsEditingNotes(false);
                    }}
                    className="px-3 py-1 rounded bg-theme-accent text-white font-mono text-xs font-bold"
                  >
                    Save Notes
                  </button>
                </div>
              </div>
            ) : (
              article.bookmarkNotes ? (
                <div className="p-3 rounded bg-theme-card/60 border border-theme-border/60 text-xs font-mono text-theme-text whitespace-pre-wrap">
                  {article.bookmarkNotes}
                </div>
              ) : (
                <p className="text-xs font-mono text-theme-text-muted italic">
                  No analyst notes attached. Click "Add Note" to record findings.
                </p>
              )
            )}
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
