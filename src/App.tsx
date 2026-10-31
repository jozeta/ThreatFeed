import React, { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
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
import { closeAllPanels, closePanel, PANEL_PARAMS, panelParam, redirectRemovedPage, useHashRoute } from './hooks/useHashRoute';
import { usePanelLevels } from './hooks/usePanelLevels';
import { PanelLevel } from './components/Common/SidePanel';
import { exitTv, tvFromParams } from './components/tv/tvRoute';

// Secondary pages load on first visit, keeping the initial bundle to what the front page needs
const SourcesPage = lazy(() => import('./pages/SourcesPage').then((m) => ({ default: m.SourcesPage })));
const FeedHealthPage = lazy(() => import('./pages/FeedHealthPage').then((m) => ({ default: m.FeedHealthPage })));
const BookmarksPage = lazy(() => import('./pages/BookmarksPage').then((m) => ({ default: m.BookmarksPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const BriefingPage = lazy(() => import('./pages/BriefingPage').then((m) => ({ default: m.BriefingPage })));
const MyFeedPage = lazy(() => import('./pages/MyFeedPage').then((m) => ({ default: m.MyFeedPage })));
const RansomwarePage = lazy(() => import('./pages/RansomwarePage').then((m) => ({ default: m.RansomwarePage })));
const VulnerabilitiesPage = lazy(() => import('./pages/VulnerabilitiesPage').then((m) => ({ default: m.VulnerabilitiesPage })));
const TvShell = lazy(() => import('./components/tv/TvShell'));

/** If the TV chunk fails to load (or the shell throws), drop out of the mode instead of unmounting the whole app */
class TvErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { exitTv(); }
  render() { return this.state.failed ? null : this.props.children; }
}
// Detail panels over any page, each from its hash parameter
const VendorPanelHost = lazy(() => import('./components/VendorPanel'));
const CvePanelHost = lazy(() => import('./pages/vulns/CvePanelHost').then((m) => ({ default: m.CvePanelHost })));
const ActorPanelHost = lazy(() => import('./components/EntityPanelHosts').then((m) => ({ default: m.ActorPanelHost })));
const MalwarePanelHost = lazy(() => import('./components/EntityPanelHosts').then((m) => ({ default: m.MalwarePanelHost })));
const GroupPanelHost = lazy(() => import('./components/EntityPanelHosts').then((m) => ({ default: m.GroupPanelHost })));
const TagPanelHost = lazy(() => import('./components/EntityPanelHosts').then((m) => ({ default: m.TagPanelHost })));

export const App: React.FC = () => {
  const { articles, feeds, isRefreshing, activeArticle, setActiveArticle } = useFeeds();
  const { settings } = useSettings();
  const { filters, updateFilter } = useFilter();
  // A category filter whose category was turned off would leave an empty list: go back to All
  useEffect(() => {
    if (filters.selectedCategory && settings.disabledCategories.includes(filters.selectedCategory)) updateFilter('selectedCategory', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.selectedCategory, settings.disabledCategories]);

  // The page lives in the URL hash (#/vulns, #/briefing…) so views can be bookmarked and Back works
  const [route, navigate] = useHashRoute();
  const activeTab: ActiveNavTab = route.page;
  const setActiveTab = useCallback((tab: ActiveNavTab) => navigate(tab), [navigate]);
  // Old links to removed pages (#/trends, #/actors?actor=G0007) become the newspaper's, keeping their panel
  useEffect(redirectRemovedPage);
  // Detail panels (?vendor=Fortinet, ?cve=…, ?actor=G0007, ?malware=…, ?group=…, ?tag=…) open over any page;
  // a blank, overlong or (for ?cve=) malformed value opens none
  const { actor, malware, group, vendor, cve, tag } = Object.fromEntries(PANEL_PARAMS.map((key) => [key, panelParam(key, route.params.get(key))]));
  const levels = usePanelLevels(route.params, Boolean(activeArticle));
  // ?tv=1 / ?dash=1: a full-screen mode over the app, which goes inert underneath
  const tvKind = tvFromParams(activeTab, route.params);
  const appRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (appRef.current) appRef.current.inert = tvKind !== null; // React 18 has no `inert` prop
    document.getElementById('tv-boot-bg')?.remove(); // index.html's pre-boot dark paint: the TV overlay (or the page) is on screen now
  }, [tvKind]);
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
  // Reading an article from a panel closes every panel first, so none is left hidden under the reader
  const openArticleFromPanel = (article: Article) => {
    closeAllPanels();
    handleOpenArticle(article);
  };

  const handleSelectFeedFromSources = (feedId: string) => {
    updateFilter('selectedSourceId', feedId);
    setActiveTab('newspaper');
  };

  return (
    <>
    <div ref={appRef} className="min-h-screen flex flex-col bg-theme-bg text-theme-text transition-colors">
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

      {/* Detail panels, over whichever page opened them, stacked in the order they were opened (their levels).
          Keyed by what they show, so a panel opened again for something else comes in anew, on top */}
      <Suspense fallback={null}>
        {actor && <PanelLevel.Provider value={levels.actor ?? 0}><ActorPanelHost key={actor} id={actor} onOpenArticle={openArticleFromPanel} /></PanelLevel.Provider>}
        {malware && <PanelLevel.Provider value={levels.malware ?? 0}><MalwarePanelHost key={malware} id={malware} onOpenArticle={openArticleFromPanel} /></PanelLevel.Provider>}
        {group && <PanelLevel.Provider value={levels.group ?? 0}><GroupPanelHost key={group} id={group} onOpenArticle={openArticleFromPanel} /></PanelLevel.Provider>}
        {vendor && <PanelLevel.Provider value={levels.vendor ?? 0}><VendorPanelHost key={vendor} vendor={vendor} onOpenArticle={openArticleFromPanel} /></PanelLevel.Provider>}
        {tag && <PanelLevel.Provider value={levels.tag ?? 0}><TagPanelHost key={tag} id={tag} onOpenArticle={openArticleFromPanel} /></PanelLevel.Provider>}
        {cve && (
          <PanelLevel.Provider value={levels.cve ?? 0}>
            <CvePanelHost
              key={cve}
              cve={cve}
              articles={articles}
              onOpenArticle={openArticleFromPanel}
              onClose={() => closePanel('cve')}
            />
          </PanelLevel.Provider>
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
    {tvKind && (
      <TvErrorBoundary>
        <Suspense fallback={<div className="tv-root fixed inset-0 z-[90]" />}>
          <TvShell kind={tvKind} page={activeTab} />
        </Suspense>
      </TvErrorBoundary>
    )}
    </>
  );
};
export default App;
