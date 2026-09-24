import React, { useState } from 'react';
import { Article } from '../types';
import { useFeeds } from '../context/FeedContext';
import { useSettings, DEFAULT_BOOKMARK_FOLDERS } from '../context/SettingsContext';
import { ThumbnailArticle } from '../components/ArticleCard/ThumbnailArticle';
import {
  Bookmark,
  Search,
  X,
  Download,
  Folder,
  FolderPlus,
  FileText,
  Trash2,
  Edit3,
  Check,
} from 'lucide-react';

interface BookmarksPageProps {
  onOpenArticle: (article: Article) => void;
}

export const BookmarksPage: React.FC<BookmarksPageProps> = ({ onOpenArticle }) => {
  const { articles, setBookmarkFolder, setBookmarkNotes } = useFeeds();
  const { settings, updateSetting } = useSettings();

  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingNoteArticleId, setEditingNoteArticleId] = useState<string | null>(null);
  const [tempNoteText, setTempNoteText] = useState('');

  const folders = settings.bookmarkFolders && settings.bookmarkFolders.length > 0
    ? settings.bookmarkFolders
    : DEFAULT_BOOKMARK_FOLDERS;

  // Filter bookmarked articles
  const savedArticles = articles.filter((a) => a.bookmarked);

  // Folder counts
  const folderCounts = folders.reduce((acc, folder) => {
    acc[folder] = savedArticles.filter(
      (a) => (a.bookmarkFolder || 'General').toLowerCase() === folder.toLowerCase()
    ).length;
    return acc;
  }, {} as Record<string, number>);

  // Collect all unique tags from bookmarked articles
  const bookmarkTags = Array.from(
    new Set(savedArticles.flatMap((a) => [...a.tags, ...(a.customTags || [])]))
  );

  // Apply search, tag & folder filter
  const filtered = savedArticles.filter((article) => {
    if (selectedFolder !== 'all') {
      const artFolder = article.bookmarkFolder || 'General';
      if (artFolder.toLowerCase() !== selectedFolder.toLowerCase()) {
        return false;
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const matches =
        article.title.toLowerCase().includes(q) ||
        (article.description && article.description.toLowerCase().includes(q)) ||
        article.sourceName.toLowerCase().includes(q) ||
        (article.bookmarkNotes && article.bookmarkNotes.toLowerCase().includes(q)) ||
        (article.cves && article.cves.some((c) => c.toLowerCase().includes(q)));
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

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    if (!folders.some((f) => f.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...folders, trimmed];
      updateSetting('bookmarkFolders', updated);
      setSelectedFolder(trimmed);
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleDeleteFolder = (folderToDelete: string) => {
    if (folderToDelete.toLowerCase() === 'general') return;
    if (window.confirm(`Delete folder "${folderToDelete}"? Articles will be moved to General.`)) {
      // Re-assign articles to General
      savedArticles.forEach((a) => {
        if ((a.bookmarkFolder || '').toLowerCase() === folderToDelete.toLowerCase()) {
          setBookmarkFolder(a.id, 'General');
        }
      });
      const updated = folders.filter((f) => f.toLowerCase() !== folderToDelete.toLowerCase());
      updateSetting('bookmarkFolders', updated);
      setSelectedFolder('all');
    }
  };

  const handleSaveNote = async (articleId: string) => {
    await setBookmarkNotes(articleId, tempNoteText.trim());
    setEditingNoteArticleId(null);
    setTempNoteText('');
  };

  const handleExportBookmarks = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(savedArticles, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `threatfeed-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-theme-border">
        <div>
          <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
            <Bookmark className="w-6 h-6 text-theme-accent fill-theme-accent" />
            <span>Saved Intelligence & Research</span>
          </h1>
          <p className="font-serif text-sm text-theme-text-muted mt-1">
            {savedArticles.length} bookmarked threat advisories, exploit writeups, and analyst assessments.
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

      {/* Bookmark Folders Navigation */}
      <div className="mt-6 flex items-center gap-2 overflow-x-auto scrollbar-none pb-2">
        <button
          onClick={() => setSelectedFolder('all')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex-shrink-0 ${
            selectedFolder === 'all'
              ? 'bg-theme-accent text-white shadow-sm font-bold'
              : 'bg-theme-surface text-theme-text-muted hover:text-theme-text border border-theme-border'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span>All Bookmarks</span>
          <span className="opacity-75">({savedArticles.length})</span>
        </button>

        {folders.map((folder) => {
          const isSelected = selectedFolder.toLowerCase() === folder.toLowerCase();
          const count = folderCounts[folder] || 0;

          return (
            <div key={folder} className="inline-flex items-center flex-shrink-0">
              <button
                onClick={() => setSelectedFolder(folder)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                  isSelected
                    ? 'bg-theme-accent text-white shadow-sm font-bold'
                    : 'bg-theme-surface text-theme-text-muted hover:text-theme-text border border-theme-border'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>{folder}</span>
                <span className="opacity-75">({count})</span>
              </button>

              {/* Delete folder button for non-General folders */}
              {isSelected && folder.toLowerCase() !== 'general' && (
                <button
                  onClick={() => handleDeleteFolder(folder)}
                  className="ml-1 p-1 text-theme-text-muted hover:text-rose-500 rounded transition-colors"
                  title={`Delete folder "${folder}"`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {/* New Folder Form */}
        {isCreatingFolder ? (
          <form onSubmit={handleCreateFolder} className="inline-flex items-center gap-1 flex-shrink-0">
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name..."
              className="px-2.5 py-1 text-xs font-mono bg-theme-surface border border-theme-accent rounded text-theme-text focus:outline-none"
            />
            <button
              type="submit"
              className="p-1.5 rounded bg-theme-accent text-white hover:opacity-90"
              title="Save Folder"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingFolder(false)}
              className="p-1.5 rounded text-theme-text-muted hover:text-theme-text"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setIsCreatingFolder(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono text-theme-text-muted hover:text-theme-text border border-dashed border-theme-border hover:border-theme-accent transition-colors flex-shrink-0"
            title="Create new folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>New Folder</span>
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
            Click the bookmark icon or press <kbd className="font-mono text-xs px-1.5 py-0.5 rounded bg-theme-card border border-theme-border text-theme-accent font-bold">b</kbd> while reading any security article to save it with analyst notes and folder organization.
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
                placeholder="Search saved articles, notes, or CVEs..."
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

          {/* Bookmarks Grid with Folder & Notes Integration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filtered.map((article) => {
              const currentFolder = article.bookmarkFolder || 'General';
              const isEditingNote = editingNoteArticleId === article.id;

              return (
                <div
                  key={article.id}
                  className="flex flex-col rounded-xl bg-theme-card border border-theme-border hover:border-theme-accent/40 transition-all overflow-hidden shadow-sm"
                >
                  {/* Article Card View */}
                  <div className="p-4 flex-grow">
                    <ThumbnailArticle
                      article={article}
                      onOpen={() => onOpenArticle(article)}
                      showBorder={false}
                    />
                  </div>

                  {/* Bookmark Folder & Notes Bar */}
                  <div className="px-4 py-3 bg-theme-surface/70 border-t border-theme-border/60 space-y-2.5 text-xs font-mono">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {/* Folder Dropdown */}
                      <div className="flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5 text-theme-accent" />
                        <select
                          value={currentFolder}
                          onChange={(e) => setBookmarkFolder(article.id, e.target.value)}
                          className="bg-theme-card border border-theme-border rounded px-2 py-1 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
                        >
                          {folders.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Edit Note Button */}
                      {!isEditingNote && (
                        <button
                          onClick={() => {
                            setEditingNoteArticleId(article.id);
                            setTempNoteText(article.bookmarkNotes || '');
                          }}
                          className="inline-flex items-center gap-1 text-theme-text-muted hover:text-theme-accent transition-colors"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>{article.bookmarkNotes ? 'Edit Note' : '+ Add Note'}</span>
                        </button>
                      )}
                    </div>

                    {/* Inline Note Editor */}
                    {isEditingNote ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          rows={2}
                          value={tempNoteText}
                          onChange={(e) => setTempNoteText(e.target.value)}
                          placeholder="Add incident response notes, IOC observations, or triage assessment..."
                          className="w-full bg-theme-card border border-theme-accent rounded p-2 text-xs font-mono text-theme-text focus:outline-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingNoteArticleId(null)}
                            className="px-2.5 py-1 rounded hover:bg-theme-surface text-theme-text-muted"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveNote(article.id)}
                            className="px-3 py-1 rounded bg-theme-accent text-white font-semibold flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            <span>Save Note</span>
                          </button>
                        </div>
                      </div>
                    ) : article.bookmarkNotes ? (
                      /* Note Display Callout */
                      <div className="p-2.5 rounded bg-theme-card/90 border border-theme-border text-theme-text-muted flex items-start gap-2">
                        <FileText className="w-3.5 h-3.5 text-theme-accent flex-shrink-0 mt-0.5" />
                        <p className="font-sans text-xs italic text-theme-text leading-relaxed whitespace-pre-wrap flex-grow">
                          {article.bookmarkNotes}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
