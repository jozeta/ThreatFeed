import React, { useEffect, useRef, useState } from 'react';
import { useFeeds } from '../../context/FeedContext';
import { useSettings } from '../../context/SettingsContext';
import { useFilter } from '../../context/FilterContext';
import { formatMastheadDate, formatRelativeTime } from '../../utils/date';
import {
  Search,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  SlidersHorizontal,
  Newspaper,
  List,
  LayoutGrid,
  CheckCheck,
  WifiOff,
  X,
  Keyboard,
  Settings as SettingsIcon,
  Radio,
  Activity,
  Star
} from 'lucide-react';
import { LayoutMode, ActiveNavTab } from '../../types';
import { NavigationTabs } from '../Navigation/NavigationTabs';

// Roughly 10 cm of scrolling on a typical screen (96 CSS px per inch)
const COLLAPSE_AFTER_PX = 380;

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onToggleFilterDrawer: () => void;
  isFilterOpen: boolean;
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenShortcuts,
  onToggleFilterDrawer,
  isFilterOpen,
  activeTab,
  onSelectTab,
}) => {
  const {
    articles,
    feeds,
    isRefreshing,
    refreshProgress,
    lastUpdated,
    refreshFeeds,
    markAllAsRead,
    isOffline,
    feedHealth,
  } = useFeeds();

  const { settings, updateSettings } = useSettings();
  const { filters, updateFilter, resetFilters, hasActiveFilters } = useFilter();

  // Statistics
  const totalArticles = articles.length;
  const unreadCount = articles.filter((a) => !a.read).length;
  const bookmarkedCount = articles.filter((a) => a.bookmarked).length;
  const activeSourcesCount = feeds.filter((f) => f.enabled).length;
  const errorFeedsCount = Object.values(feedHealth || {}).filter(
    (h) => h.status !== 'healthy'
  ).length;

  const cycleTheme = () => {
    if (settings.theme === 'dark') updateSettings({ theme: 'light' });
    else if (settings.theme === 'light') updateSettings({ theme: 'system' });
    else updateSettings({ theme: 'dark' });
  };

  const handleLayoutChange = (mode: LayoutMode) => {
    updateSettings({ layout: mode });
  };

  // After the page has scrolled about 10 cm, the status bar and masthead slide up out of view and
  // only the tabs and toolbar stay pinned. A transform (not a height change) keeps the page from jumping.
  const mastheadRef = useRef<HTMLDivElement>(null);
  const [mastheadHeight, setMastheadHeight] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const el = mastheadRef.current;
    if (!el) return;
    setMastheadHeight(el.offsetHeight);
    const observer = new ResizeObserver(() => setMastheadHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Hidden controls shouldn't be reachable with Tab or by screen readers (React 18 has no `inert` prop)
  useEffect(() => {
    if (mastheadRef.current) mastheadRef.current.inert = collapsed;
  }, [collapsed]);

  useEffect(() => {
    // React skips the re-render when the value is unchanged, so this is cheap on every scroll event
    const onScroll = () => setCollapsed(window.scrollY > COLLAPSE_AFTER_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="border-b border-theme-border bg-theme-surface/90 backdrop-blur-md sticky top-0 z-30 transition-[transform,background-color,border-color] duration-300 ease-out"
      style={{ transform: collapsed && mastheadHeight ? `translateY(-${mastheadHeight}px)` : undefined }}
    >
      <div ref={mastheadRef}>
      {/* Offline Alert Banner */}
      {isOffline && (
        <div className="bg-amber-600/90 text-white text-xs font-mono py-1 px-4 text-center flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline mode · Showing cached articles</span>
        </div>
      )}

      {/* Editorial Top Status Bar */}
      <div className="border-b border-theme-border/50">
        <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-1.5 text-[11px] font-mono text-theme-text-muted flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold tracking-wider text-theme-accent uppercase">
              DEFENSE EDITION
            </span>
            <span className="hidden sm:inline text-theme-border">|</span>
            <span className="hidden sm:inline">
              {totalArticles.toLocaleString()} DISPATCHES · {unreadCount} UNREAD · {bookmarkedCount} BOOKMARKED · {activeSourcesCount} FEEDS
            </span>
          </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Refresh status */}
          <div className="flex items-center gap-1.5 mr-1 hidden md:flex">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isRefreshing ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'
              }`}
            />
            <span className="hidden lg:inline text-[10px]">
              {isRefreshing
                ? `Updating (${refreshProgress.completed}/${refreshProgress.total})...`
                : lastUpdated
                ? `${formatRelativeTime(lastUpdated.toISOString())}`
                : 'Ready'}
            </span>
          </div>

          {/* Keys button */}
          <button
            onClick={onOpenShortcuts}
            title="Keyboard shortcuts (?)"
            className="hover:text-theme-text p-1.5 rounded hover:bg-theme-card transition-colors hidden sm:flex items-center gap-1"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>KEYS</span>
          </button>

          {/* Refresh button (icon only) */}
          <button
            onClick={() => refreshFeeds()}
            disabled={isRefreshing}
            title="Refresh feeds (r)"
            className="p-1.5 rounded hover:bg-theme-card text-theme-text-muted hover:text-theme-text transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-theme-accent' : ''}`} />
          </button>

          {/* Sources button (icon only) */}
          <button
            onClick={() => onSelectTab('sources')}
            title="Intelligence Sources & Feeds"
            className={`p-1.5 rounded transition-colors ${
              activeTab === 'sources'
                ? 'bg-theme-accent text-white shadow-sm font-bold'
                : 'hover:bg-theme-card text-theme-text-muted hover:text-theme-text'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
          </button>

          {/* Health button (icon only, with error badge) */}
          <button
            onClick={() => onSelectTab('health')}
            title={`Feed Health & Diagnostics ${errorFeedsCount > 0 ? `(${errorFeedsCount} issues)` : '(Healthy)'}`}
            className={`p-1.5 rounded transition-colors relative ${
              activeTab === 'health'
                ? 'bg-theme-accent text-white shadow-sm font-bold'
                : 'hover:bg-theme-card text-theme-text-muted hover:text-theme-text'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            {errorFeedsCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute top-1 right-1" />
            )}
          </button>

          {/* Theme switcher (icon only) */}
          <button
            onClick={cycleTheme}
            title={`Current theme: ${settings.theme}. Click to switch.`}
            className="p-1.5 rounded hover:bg-theme-card text-theme-text-muted hover:text-theme-text transition-colors"
          >
            {settings.theme === 'dark' ? (
              <Moon className="w-3.5 h-3.5 text-theme-accent" />
            ) : settings.theme === 'light' ? (
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Monitor className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Settings button (icon only) */}
          <button
            onClick={() => {
              onOpenSettings();
              onSelectTab('settings');
            }}
            title="Settings & Preferences"
            className={`p-1.5 rounded transition-colors ${
              activeTab === 'settings'
                ? 'bg-theme-accent text-white shadow-sm font-bold'
                : 'hover:bg-theme-card text-theme-text-muted hover:text-theme-text'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

      {/* Main Newspaper Masthead */}
      <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-5 text-center relative">
        <div className="inline-block cursor-pointer" onClick={() => resetFilters()}>
          <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-theme-text uppercase select-none hover:opacity-90 transition-opacity">
            THREATFEED
          </h1>
          <p className="font-mono text-[10px] sm:text-xs tracking-[0.28em] text-theme-accent uppercase font-bold mt-1">
            SECURITY INTELLIGENCE DAILY
          </p>
        </div>

        {/* Date Display */}
        <div className="mt-2 flex items-center justify-center gap-3 text-xs font-mono text-theme-text-muted tracking-wider">
          <div className="h-[1px] w-8 sm:w-16 bg-theme-border" />
          <time dateTime={new Date().toISOString()}>{formatMastheadDate()}</time>
          <div className="h-[1px] w-8 sm:w-16 bg-theme-border" />
        </div>
      </div>
      </div>

      {/* Navigation Tabs with Category Dropdown & Watchlist Button */}
      <NavigationTabs activeTab={activeTab} onSelectTab={onSelectTab} />

      {/* Interactive Controls & Navigation Toolbar (Row with the search bar) */}
      <div className="border-t border-theme-border/60">
        <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Search & Filters */}
        <div className="flex items-center gap-2 flex-grow sm:flex-grow-0">
          {/* Quick Search */}
          <div className="relative flex-grow sm:w-64 md:w-80">
            <Search className="w-4 h-4 text-theme-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              id="global-search-input"
              value={filters.searchQuery}
              onChange={(e) => updateFilter('searchQuery', e.target.value)}
              placeholder="Search security news... (f)"
              className="w-full pl-9 pr-14 py-1.5 text-xs font-mono bg-theme-card border border-theme-border rounded-md text-theme-text placeholder:text-theme-text-muted focus:outline-none focus:border-theme-accent transition-colors"
            />
            {filters.searchQuery && (() => {
              const query = filters.searchQuery.trim();
              const isSaved = settings.savedSearches.includes(query);
              return (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <button
                    onClick={() => updateSettings({
                      savedSearches: isSaved ? settings.savedSearches.filter((q) => q !== query) : [...settings.savedSearches, query],
                    })}
                    title={isSaved ? 'Remove from saved searches' : 'Save this search (shown in the Filter panel)'}
                    aria-label={isSaved ? 'Remove saved search' : 'Save search'}
                    className={isSaved ? 'text-theme-accent' : 'text-theme-text-muted hover:text-theme-text'}
                  >
                    <Star className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    onClick={() => updateFilter('searchQuery', '')}
                    aria-label="Clear search"
                    className="text-theme-text-muted hover:text-theme-text"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Filter Toggle Button */}
          <button
            onClick={onToggleFilterDrawer}
            className={`px-3 py-1.5 rounded-md text-xs font-mono flex items-center gap-1.5 transition-colors border ${
              isFilterOpen || hasActiveFilters
                ? 'bg-theme-accent-subtle text-theme-accent border-theme-accent/40 font-bold'
                : 'bg-theme-card border-theme-border text-theme-text-muted hover:text-theme-text'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filter</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-theme-accent" />
            )}
          </button>
        </div>

        {/* Right: Layout Switcher, Refresh, Read All, Theme, Settings */}
        <div className="flex items-center gap-1 sm:gap-2 ml-auto">
          {/* Layout switcher buttons (Requirement 9) */}
          <div className="flex items-center border border-theme-border rounded-md p-0.5 bg-theme-card">
            <button
              onClick={() => handleLayoutChange('newspaper')}
              title="Newspaper Editorial Layout"
              aria-label="Newspaper Editorial Layout"
              className={`p-1.5 rounded transition-colors ${
                settings.layout === 'newspaper'
                  ? 'bg-theme-surface text-theme-accent shadow-sm'
                  : 'text-theme-text-muted hover:text-theme-text'
              }`}
            >
              <Newspaper className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleLayoutChange('list-thumbnails')}
              title="List + Thumbnails Layout"
              aria-label="List + Thumbnails Layout"
              className={`p-1.5 rounded transition-colors ${
                settings.layout === 'list-thumbnails'
                  ? 'bg-theme-surface text-theme-accent shadow-sm'
                  : 'text-theme-text-muted hover:text-theme-text'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleLayoutChange('list')}
              title="Compact List Layout"
              aria-label="Compact List Layout"
              className={`p-1.5 rounded transition-colors ${
                settings.layout === 'list'
                  ? 'bg-theme-surface text-theme-accent shadow-sm'
                  : 'text-theme-text-muted hover:text-theme-text'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <div className="w-[1px] h-5 bg-theme-border mx-1 hidden sm:block" />

          {/* Mark all as read */}
          <button
            onClick={() => markAllAsRead()}
            title="Mark all as read"
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-md border border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text text-xs font-mono transition-colors flex items-center gap-1"
          >
            <CheckCheck className="w-4 h-4" />
            <span className="hidden lg:inline">Mark Read</span>
          </button>
        </div>
      </div>
    </div>
  </header>
);
};
