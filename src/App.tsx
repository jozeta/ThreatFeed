import React, { useState, useMemo } from 'react';
import { useFeeds } from './context/FeedContext';
import { useSettings } from './context/SettingsContext';
import { useFilter } from './context/FilterContext';
import { filterAndSortArticles } from './services/articles/filterSort';
import { Header } from './components/Header/Header';
import { FilterBar } from './components/FilterBar/FilterBar';
import { NavigationTabs } from './components/Navigation/NavigationTabs';
import { NewspaperView } from './components/Newspaper/NewspaperView';
import { ListView } from './components/Layouts/ListView';
import { ListThumbnailView } from './components/Layouts/ListThumbnailView';
import { ReaderModal } from './components/Reader/ReaderModal';
import { SourcesPage } from './pages/SourcesPage';
import { FeedHealthPage } from './pages/FeedHealthPage';
import { BookmarksPage } from './pages/BookmarksPage';
import { SettingsPage } from './pages/SettingsPage';
import { KeyboardShortcutsModal } from './components/Common/KeyboardShortcutsModal';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { formatMastheadDate } from './utils/date';
import { ActiveNavTab, Article } from './types';

export const App: React.FC = () => {
  const { articles, isRefreshing, activeArticle, setActiveArticle } = useFeeds();
  const { settings } = useSettings();
  const { filters, updateFilter } = useFilter();

  const [activeTab, setActiveTab] = useState<ActiveNavTab>('newspaper');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Setup global keyboard shortcuts (r, f, ?, Esc, etc.)
  useKeyboardNavigation({
    onOpenShortcuts: () => setIsShortcutsOpen(true),
    onOpenSettings: () => setActiveTab('settings'),
    isModalOpen: Boolean(activeArticle || isShortcutsOpen),
  });

  // Calculate filtered articles based on tab and active filters
  const displayArticles = useMemo(() => {
    // If user is on 'unread' tab, enforce unread filter
    const effectiveFilters = activeTab === 'unread'
      ? { ...filters, readStatus: 'unread' as const }
      : filters;

    return filterAndSortArticles(articles, effectiveFilters, settings.hideReadArticles);
  }, [articles, filters, activeTab, settings.hideReadArticles]);

  // Find index of active article for next / previous navigation in reader
  const activeArticleIndex = useMemo(() => {
    if (!activeArticle) return -1;
    return displayArticles.findIndex((a) => a.id === activeArticle.id);
  }, [activeArticle, displayArticles]);

  const handleNextArticle = () => {
    if (activeArticleIndex >= 0 && activeArticleIndex < displayArticles.length - 1) {
      setActiveArticle(displayArticles[activeArticleIndex + 1]);
    }
  };

  const handlePrevArticle = () => {
    if (activeArticleIndex > 0) {
      setActiveArticle(displayArticles[activeArticleIndex - 1]);
    }
  };

  const handleOpenArticle = (article: Article) => {
    setActiveArticle(article);
  };

  const handleSelectFeedFromSources = (feedId: string) => {
    updateFilter('selectedSourceId', feedId);
    setActiveTab('newspaper');
  };

  return (
    <div className="min-h-screen flex flex-col bg-theme-bg text-theme-text transition-colors">
      {/* Print-Only Masthead Header (Requirement 48) */}
      <div id="print-masthead" className="hidden">
        <h1 className="font-serif text-3xl font-black uppercase">THREATFEED</h1>
        <p className="font-mono text-xs uppercase tracking-widest">
          SECURITY INTELLIGENCE DAILY · {formatMastheadDate()}
        </p>
      </div>

      {/* Screen Masthead & Application Header */}
      <Header
        onOpenSettings={() => setActiveTab('settings')}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onToggleFilterDrawer={() => setIsFilterOpen(!isFilterOpen)}
        isFilterOpen={isFilterOpen}
      />

      {/* Navigation Tabs (Newspaper, Latest, Unread, Saved, Sources, Health, Settings) */}
      <NavigationTabs
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'unread') {
            updateFilter('readStatus', 'unread');
          } else {
            updateFilter('readStatus', 'all');
          }
        }}
      />

      {/* Filter Bar (Only shown on news feed tabs: newspaper, latest, unread) */}
      {(activeTab === 'newspaper' || activeTab === 'latest' || activeTab === 'unread') && (
        <FilterBar
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-grow pb-16 sm:pb-8">
        {activeTab === 'newspaper' && (
          <>
            {settings.layout === 'newspaper' && (
              <NewspaperView
                articles={displayArticles}
                isLoading={isRefreshing}
                onOpenArticle={handleOpenArticle}
              />
            )}
            {settings.layout === 'list-thumbnails' && (
              <ListThumbnailView
                articles={displayArticles}
                isLoading={isRefreshing}
                onOpenArticle={handleOpenArticle}
              />
            )}
            {settings.layout === 'list' && (
              <ListView
                articles={displayArticles}
                isLoading={isRefreshing}
                onOpenArticle={handleOpenArticle}
              />
            )}
          </>
        )}

        {activeTab === 'latest' && (
          <>
            {settings.layout === 'newspaper' && (
              <NewspaperView
                articles={displayArticles}
                isLoading={isRefreshing}
                onOpenArticle={handleOpenArticle}
              />
            )}
            {settings.layout === 'list-thumbnails' && (
              <ListThumbnailView
                articles={displayArticles}
                isLoading={isRefreshing}
                onOpenArticle={handleOpenArticle}
              />
            )}
            {settings.layout === 'list' && (
              <ListView
                articles={displayArticles}
                isLoading={isRefreshing}
                onOpenArticle={handleOpenArticle}
              />
            )}
          </>
        )}

        {activeTab === 'unread' && (
          <>
            {settings.layout === 'newspaper' ? (
              <NewspaperView
                articles={displayArticles}
                isLoading={isRefreshing}
                onOpenArticle={handleOpenArticle}
              />
            ) : settings.layout === 'list-thumbnails' ? (
              <ListThumbnailView
                articles={displayArticles}
                isLoading={isRefreshing}
                onOpenArticle={handleOpenArticle}
              />
            ) : (
              <ListView
                articles={displayArticles}
                isLoading={isRefreshing}
                onOpenArticle={handleOpenArticle}
              />
            )}
          </>
        )}

        {activeTab === 'bookmarks' && (
          <BookmarksPage onOpenArticle={handleOpenArticle} />
        )}

        {activeTab === 'sources' && (
          <SourcesPage onSelectFeed={handleSelectFeedFromSources} />
        )}

        {activeTab === 'health' && (
          <FeedHealthPage onOpenSettings={() => setActiveTab('settings')} />
        )}

        {activeTab === 'settings' && (
          <SettingsPage />
        )}
      </main>

      {/* Reader Modal (Distraction-free article reader) */}
      {activeArticle && (
        <ReaderModal
          article={activeArticle}
          onClose={() => setActiveArticle(null)}
          onNext={handleNextArticle}
          onPrev={handlePrevArticle}
          hasNext={activeArticleIndex < displayArticles.length - 1}
          hasPrev={activeArticleIndex > 0}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
};
export default App;
