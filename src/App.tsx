import React, { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { useFeeds } from './context/FeedContext';
import { useSettings } from './context/SettingsContext';
import { useFilter } from './context/FilterContext';
import { filterAndSortArticles } from './services/articles/filterSort';
import { buildSearchIndex, searchScores } from './services/articles/search';
import { Header } from './components/Header/Header';
import { FilterBar } from './components/FilterBar/FilterBar';
import { NewspaperView } from './components/Newspaper/NewspaperView';
import { ListView } from './components/Layouts/ListView';
import { ListThumbnailView } from './components/Layouts/ListThumbnailView';
import { ReaderModal } from './components/Reader/ReaderModal';
import { KeyboardShortcutsModal } from './components/Common/KeyboardShortcutsModal';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { formatMastheadDate } from './utils/date';
import { ActiveNavTab, Article } from './types';
import { AlertMonitor } from './components/AlertMonitor';
import { CveWatchMonitor } from './components/CveWatchMonitor';
import { redirectRemovedPage, setHashParams, useHashRoute } from './hooks/useHashRoute';

// Secondary pages load on first visit, keeping the initial bundle to what the front page needs
const SourcesPage = lazy(() => import('./pages/SourcesPage').then((m) => ({ default: m.SourcesPage })));
const FeedHealthPage = lazy(() => import('./pages/FeedHealthPage').then((m) => ({ default: m.FeedHealthPage })));
const BookmarksPage = lazy(() => import('./pages/BookmarksPage').then((m) => ({ default: m.BookmarksPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const BriefingPage = lazy(() => import('./pages/BriefingPage').then((m) => ({ default: m.BriefingPage })));
const MyFeedPage = lazy(() => import('./pages/MyFeedPage').then((m) => ({ default: m.MyFeedPage })));
const RansomwarePage = lazy(() => import('./pages/RansomwarePage').then((m) => ({ default: m.RansomwarePage })));
const VulnerabilitiesPage = lazy(() => import('./pages/VulnerabilitiesPage').then((m) => ({ default: m.VulnerabilitiesPage })));
// Detail panels over any page, each from its hash parameter
const VendorPanelHost = lazy(() => import('./components/VendorPanel'));
const CvePanelHost = lazy(() => import('./pages/vulns/CvePanelHost').then((m) => ({ default: m.CvePanelHost })));
const ActorPanelHost = lazy(() => import('./components/EntityPanelHosts').then((m) => ({ default: m.ActorPanelHost })));
const MalwarePanelHost = lazy(() => import('./components/EntityPanelHosts').then((m) => ({ default: m.MalwarePanelHost })));
const GroupPanelHost = lazy(() => import('./components/EntityPanelHosts').then((m) => ({ default: m.GroupPanelHost })));

export const App: React.FC = () => {
  const { articles, feeds, isRefreshing, activeArticle, setActiveArticle } = useFeeds();
  const { settings } = useSettings();
  const { filters, updateFilter } = useFilter();

  // The page lives in the URL hash (#/vulns, #/briefing…) so views can be bookmarked and Back works
  const [route, navigate] = useHashRoute();
  const activeTab: ActiveNavTab = route.page;
  const setActiveTab = useCallback((tab: ActiveNavTab) => navigate(tab), [navigate]);
  // Old links to removed pages (#/trends, #/actors?actor=G0007) become the newspaper's, keeping their panel
  useEffect(redirectRemovedPage);
  // Detail panels (?vendor=Fortinet, ?cve=…, ?actor=G0007, ?malware=…, ?group=…) open over any page
  const panel = (key: string) => route.params.get(key) ?? '';
  const [vendor, cve, actor, malware, group] = ['vendor', 'cve', 'actor', 'malware', 'group'].map(panel);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Setup global keyboard shortcuts (r, f, ?, Esc, etc.)
  useKeyboardNavigation({
    onOpenShortcuts: () => setIsShortcutsOpen(true),
    onOpenSettings: () => setActiveTab('settings'),
    isModalOpen: Boolean(activeArticle || isShortcutsOpen),
  });

  // The full-text index only exists while searching, and is keyed on which articles exist (not their
  // read/bookmark state) so toggling an article doesn't rebuild it
  const isSearching = filters.searchQuery.trim().length > 0;
  const articleIdsKey = useMemo(() => articles.map((a) => a.id).join('|'), [articles]);
  const searchIndex = useMemo(
    () => (isSearching ? buildSearchIndex(articles) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- articles is captured via articleIdsKey
    [articleIdsKey, isSearching]
  );
  const scores = useMemo(
    () => (searchIndex ? searchScores(searchIndex, filters.searchQuery) : null),
    [searchIndex, filters.searchQuery]
  );

  // Calculate filtered articles based on tab and active filters
  const displayArticles = useMemo(() => {
    // 'unread' enforces the unread filter; 'latest' is always a newest-first stream
    const effectiveFilters =
      activeTab === 'unread' ? { ...filters, readStatus: 'unread' as const }
      : activeTab === 'latest' && !(isSearching && filters.sortBy === 'relevance') ? { ...filters, sortBy: 'newest' as const }
      : filters;

    return filterAndSortArticles(
      articles,
      effectiveFilters,
      settings.hideReadArticles,
      feeds,
      settings.watchlistKeywords,
      {
        searchScores: scores,
        mutedKeywords: settings.mutedKeywords,
        // Hidden categories only leave the front page; Latest/Unread and the category filter still show them
        hiddenCategories: activeTab === 'newspaper' && !filters.selectedCategory ? settings.frontPageHiddenCategories : [],
      }
    );
  }, [articles, filters, activeTab, settings.hideReadArticles, feeds, settings.watchlistKeywords, scores, settings.mutedKeywords, settings.frontPageHiddenCategories]);

  // Trending entities, the briefing and similar views jump to a search
  const handleSearch = (query: string) => {
    updateFilter('searchQuery', query);
    updateFilter('sortBy', 'relevance');
    setActiveTab('latest');
  };

  // The reader navigates the list as it was when it opened. Opening an article marks it read,
  // which removes it from displayArticles on the Unread tab or with "hide read" on.
  const [readerOrder, setReaderOrder] = useState<string[]>([]);

  const activeArticleIndex = useMemo(() => {
    if (!activeArticle) return -1;
    return readerOrder.indexOf(activeArticle.id);
  }, [activeArticle, readerOrder]);

  const openFromReaderOrder = (index: number) => {
    const id = readerOrder[index];
    // Prefer the live copy so read/bookmark state is current
    const article = articles.find((a) => a.id === id);
    if (article) setActiveArticle(article);
  };

  const handleNextArticle = () => {
    if (activeArticleIndex >= 0 && activeArticleIndex < readerOrder.length - 1) {
      openFromReaderOrder(activeArticleIndex + 1);
    }
  };

  const handlePrevArticle = () => {
    if (activeArticleIndex > 0) {
      openFromReaderOrder(activeArticleIndex - 1);
    }
  };

  const handleOpenArticle = (article: Article) => {
    setReaderOrder(displayArticles.map((a) => a.id));
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

      <CveWatchMonitor />
      <AlertMonitor />

      {/* Screen Masthead, Navigation & Controls Header */}
      <Header
        onOpenSettings={() => setActiveTab('settings')}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onToggleFilterDrawer={() => setIsFilterOpen(!isFilterOpen)}
        isFilterOpen={isFilterOpen}
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
        {(activeTab === 'newspaper' || activeTab === 'latest' || activeTab === 'unread') && (() => {
          const layout = settings.layout;
          const viewProps = { articles: displayArticles, isLoading: isRefreshing, onOpenArticle: handleOpenArticle };
          return layout === 'newspaper' ? <NewspaperView key={activeTab} {...viewProps} onSearch={handleSearch} chronological={activeTab === 'latest'} />
            : layout === 'list-thumbnails' ? <ListThumbnailView {...viewProps} />
            : <ListView {...viewProps} />;
        })()}

        <Suspense fallback={<div className="main-content-container mx-auto px-4 py-12 text-xs font-mono text-theme-text-muted">Loading…</div>}>
          {activeTab === 'briefing' && (
            <BriefingPage onOpenArticle={handleOpenArticle} onSearch={handleSearch} />
          )}

          {activeTab === 'feed' && <MyFeedPage onOpenArticle={handleOpenArticle} />}
          {activeTab === 'ransomware' && <RansomwarePage onOpenArticle={handleOpenArticle} />}
          {activeTab === 'vulnerabilities' && <VulnerabilitiesPage onOpenArticle={handleOpenArticle} />}

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
        </Suspense>
      </main>

      {/* Detail panels, over whichever page opened them; their levels stack a CVE over a vendor over the rest */}
      <Suspense fallback={null}>
        {actor && <ActorPanelHost id={actor} onOpenArticle={handleOpenArticle} />}
        {malware && <MalwarePanelHost id={malware} onOpenArticle={handleOpenArticle} />}
        {group && <GroupPanelHost id={group} onOpenArticle={handleOpenArticle} />}
        {vendor && <VendorPanelHost vendor={vendor} onOpenArticle={handleOpenArticle} />}
        {cve && (
          <CvePanelHost
            cve={cve}
            articles={articles}
            onOpenArticle={(a) => { setHashParams({ cve: '' }); handleOpenArticle(a); }}
            onClose={() => setHashParams({ cve: '' })}
          />
        )}
      </Suspense>

      {/* Reader Modal (Distraction-free article reader) */}
      {activeArticle && (
        <ReaderModal
          article={activeArticle}
          onClose={() => setActiveArticle(null)}
          onNext={handleNextArticle}
          onPrev={handlePrevArticle}
          hasNext={activeArticleIndex >= 0 && activeArticleIndex < readerOrder.length - 1}
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
