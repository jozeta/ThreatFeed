import React, { useState } from 'react';
import { Feed } from '../types';
import { useFeeds } from '../context/FeedContext';
import { useFilter } from '../context/FilterContext';
import { exportFeedsToOPML, parseOPML } from '../services/rss/opml';
import { isValidFeedUrl } from '../services/rss/sanitizer';
import {
  Radio,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Layers,
  X
} from 'lucide-react';

interface SourcesPageProps {
  onSelectFeed: (feedId: string) => void;
}

export const SourcesPage: React.FC<SourcesPageProps> = ({ onSelectFeed }) => {
  const {
    feeds,
    articles,
    feedHealth,
    toggleFeedEnabled,
    addCustomFeed,
    addCustomFeeds,
    updateFeed,
    removeFeed,
    resetFeedsToDefault,
    refreshFeeds,
    isRefreshing
  } = useFeeds();

  const { updateFilter } = useFilter();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);

  // Add feed form state
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formCategory, setFormCategory] = useState('Security News');
  const [formTags, setFormTags] = useState('');
  const [formError, setFormError] = useState('');

  // Group feeds by category
  const categories = Array.from(new Set(feeds.map((f) => f.category)));

  // Calculate article counts per feed
  const articleCounts = articles.reduce((acc, a) => {
    acc[a.sourceId] = (acc[a.sourceId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const unreadCounts = articles.reduce((acc, a) => {
    if (!a.read) {
      acc[a.sourceId] = (acc[a.sourceId] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const handleOpenAddModal = () => {
    setFormName('');
    setFormUrl('');
    setFormCategory('Security News');
    setFormTags('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (feed: Feed) => {
    setEditingFeed(feed);
    setFormName(feed.name);
    setFormUrl(feed.url);
    setFormCategory(feed.category);
    setFormTags(feed.tags.join(', '));
    setFormError('');
  };

  const handleSaveFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formUrl.trim()) {
      setFormError('Source name and URL are required.');
      return;
    }

    if (!isValidFeedUrl(formUrl.trim())) {
      setFormError('Please enter a valid HTTP or HTTPS feed URL.');
      return;
    }

    const tagsArray = formTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    if (editingFeed) {
      await updateFeed({
        ...editingFeed,
        name: formName.trim(),
        url: formUrl.trim(),
        category: formCategory.trim(),
        tags: tagsArray,
      });
      setEditingFeed(null);
    } else {
      await addCustomFeed({
        name: formName.trim(),
        url: formUrl.trim(),
        category: formCategory.trim(),
        tags: tagsArray,
        enabled: true,
      });
      setIsAddModalOpen(false);
    }
  };

  const handleExportOPML = () => {
    const opmlText = exportFeedsToOPML(feeds);
    const blob = new Blob([opmlText], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `threatfeed-subscriptions-${new Date().toISOString().slice(0, 10)}.opml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportOPML = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const imported = parseOPML(text);
        await addCustomFeeds(
          imported
            .filter(item => item.name && item.url && isValidFeedUrl(item.url))
            .map(item => ({
              name: item.name!,
              url: item.url!,
              category: item.category || 'Imported',
              tags: item.tags || ['imported'],
              enabled: true,
            }))
        );
      } catch (err) {
        alert('Failed to parse OPML file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFilterBySource = (feedId: string) => {
    updateFilter('selectedSourceId', feedId);
    onSelectFeed(feedId);
  };

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-theme-border">
        <div>
          <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-theme-accent" />
            <span>Intelligence Feeds & Sources</span>
          </h1>
          <p className="font-serif text-sm text-theme-text-muted mt-1">
            Configure {feeds.length} cybersecurity news wires, threat labs, and vulnerability repositories.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <button
            onClick={handleOpenAddModal}
            className="px-3 py-2 rounded bg-theme-accent text-white hover:bg-theme-accent-hover transition-colors flex items-center gap-1.5 font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Custom Feed</span>
          </button>

          <button
            onClick={handleExportOPML}
            className="px-3 py-2 rounded bg-theme-card border border-theme-border text-theme-text hover:border-theme-accent transition-colors flex items-center gap-1.5"
            title="Export feeds as standard OPML 2.0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export OPML</span>
          </button>

          <label className="px-3 py-2 rounded bg-theme-card border border-theme-border text-theme-text hover:border-theme-accent transition-colors flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Import OPML</span>
            <input type="file" accept=".opml,.xml" onChange={handleImportOPML} className="hidden" />
          </label>

          <button
            onClick={resetFeedsToDefault}
            className="px-3 py-2 rounded bg-theme-card border border-theme-border text-theme-text-muted hover:text-rose-500 hover:border-rose-500 transition-colors flex items-center gap-1.5"
            title="Reset subscriptions to default curated security feeds"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Feeds</span>
          </button>
        </div>
      </div>

      {/* Categories Grouping */}
      <div className="space-y-10 mt-8">
        {categories.map((category) => {
          const categoryFeeds = feeds.filter((f) => f.category === category);
          return (
            <div key={category} className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
                <Layers className="w-4 h-4 text-theme-accent" />
                <h2 className="font-serif text-xl font-bold text-theme-text">
                  {category}
                </h2>
                <span className="font-mono text-xs text-theme-text-muted">
                  ({categoryFeeds.length} sources)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryFeeds.map((feed) => {
                  const health = feedHealth[feed.id];
                  const totalCount = articleCounts[feed.id] || 0;
                  const unread = unreadCounts[feed.id] || 0;

                  return (
                    <div
                      key={feed.id}
                      className={`p-4 rounded-lg bg-theme-surface border transition-all ${
                        feed.enabled
                          ? 'border-theme-border hover:border-theme-accent/50 shadow-sm'
                          : 'border-theme-border/40 opacity-60 bg-theme-card/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <h3
                            onClick={() => handleFilterBySource(feed.id)}
                            className="font-serif text-base font-bold text-theme-text hover:text-theme-accent transition-colors cursor-pointer truncate"
                            title="Click to view articles from this source"
                          >
                            {feed.name}
                          </h3>
                          <a
                            href={feed.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[11px] text-theme-text-muted hover:underline flex items-center gap-1 truncate max-w-xs mt-0.5"
                          >
                            <span className="truncate">{feed.url}</span>
                            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                          </a>
                        </div>

                        {/* Enable/Disable Toggle Switch */}
                        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={feed.enabled}
                            onChange={() => toggleFeedEnabled(feed.id)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-theme-card border border-theme-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-theme-accent"></div>
                        </label>
                      </div>

                      {/* Health & Article Stats */}
                      <div className="flex items-center justify-between text-xs font-mono pt-3 mt-2 border-t border-theme-border/50 text-theme-text-muted">
                        <div className="flex items-center gap-2">
                          {health?.status === 'healthy' ? (
                            <span className="flex items-center gap-1 text-emerald-500 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Healthy</span>
                            </span>
                          ) : health?.status === 'proxy_unreachable' ? (
                            <span className="flex items-center gap-1 text-amber-500 font-medium" title={health.errorMessage}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Proxy Can't Reach Site</span>
                            </span>
                          ) : health?.status === 'cors_error' ? (
                            <span className="flex items-center gap-1 text-amber-500 font-medium" title={health.errorMessage}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>CORS Restricted</span>
                            </span>
                          ) : health?.status ? (
                            <span className="flex items-center gap-1 text-rose-500 font-medium" title={health.errorMessage}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Error</span>
                            </span>
                          ) : (
                            <span className="text-theme-text-muted">Idle</span>
                          )}
                          <span>·</span>
                          <span className="text-theme-text">
                            {totalCount} articles ({unread} unread)
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => refreshFeeds(feed.id)}
                            disabled={isRefreshing}
                            title="Refresh this feed"
                            className="p-1 hover:bg-theme-card text-theme-text-muted hover:text-theme-text rounded transition-colors"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(feed)}
                            title="Edit feed metadata"
                            className="p-1 hover:bg-theme-card text-theme-text-muted hover:text-theme-text rounded transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {feed.isCustom && (
                            <button
                              onClick={() => removeFeed(feed.id)}
                              title="Delete custom feed"
                              className="p-1 hover:bg-rose-500/10 text-rose-500 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Feed Modal */}
      {(isAddModalOpen || editingFeed) && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-theme-surface w-full max-w-lg rounded-xl shadow-2xl border border-theme-border p-6 relative">
            <button
              onClick={() => {
                setIsAddModalOpen(false);
                setEditingFeed(null);
              }}
              className="absolute top-4 right-4 text-theme-text-muted hover:text-theme-text"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-serif text-xl font-bold text-theme-text mb-1">
              {editingFeed ? 'Edit Feed Subscription' : 'Add Custom Security Feed'}
            </h3>
            <p className="text-xs font-mono text-theme-text-muted mb-4">
              Enter the RSS 2.0 or Atom XML endpoint URL.
            </p>

            {formError && (
              <div className="mb-4 p-3 rounded bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-mono">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveFeed} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-theme-text-muted uppercase mb-1">Feed Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Unit 42 Palo Alto"
                  className="w-full bg-theme-card border border-theme-border rounded px-3 py-2 text-theme-text focus:outline-none focus:border-theme-accent"
                />
              </div>

              <div>
                <label className="block text-theme-text-muted uppercase mb-1">Feed XML URL</label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://example.com/rss.xml"
                  className="w-full bg-theme-card border border-theme-border rounded px-3 py-2 text-theme-text focus:outline-none focus:border-theme-accent"
                />
              </div>

              <div>
                <label className="block text-theme-text-muted uppercase mb-1">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full bg-theme-card border border-theme-border rounded px-3 py-2 text-theme-text focus:outline-none focus:border-theme-accent"
                >
                  <option value="Security News">Security News</option>
                  <option value="Vulnerabilities">Vulnerabilities</option>
                  <option value="Threat Intelligence">Threat Intelligence</option>
                  <option value="Malware">Malware</option>
                  <option value="Research">Research</option>
                  <option value="Red Team">Red Team</option>
                  <option value="Blue Team">Blue Team</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-theme-text-muted uppercase mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="e.g. exploit, zero-day, reverse-engineering"
                  className="w-full bg-theme-card border border-theme-border rounded px-3 py-2 text-theme-text focus:outline-none focus:border-theme-accent"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-theme-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingFeed(null);
                  }}
                  className="px-4 py-2 rounded bg-theme-card border border-theme-border text-theme-text hover:bg-theme-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-theme-accent text-white font-bold hover:bg-theme-accent-hover"
                >
                  {editingFeed ? 'Update Feed' : 'Add Feed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
