import React, { useMemo } from 'react';
import { ActiveNavTab } from '../../types';
import { useFeeds } from '../../context/FeedContext';
import { useFilter } from '../../context/FilterContext';
import { useSettings } from '../../context/SettingsContext';
import {
  Newspaper,
  Clock,
  Inbox,
  Bookmark,
  Target,
  ClipboardList,
  Skull,
  ShieldAlert,
} from 'lucide-react';

const ORDERED_PRIMARY_CATEGORIES = [
  'All',
  'Security News',
  'Threat Intelligence',
  'Vulnerabilities',
  'Malware',
  'Research',
  'Red Team',
  'Blue Team',
  'Microsoft Security',
  'CISO & Leadership',
  'General Tech',
  'Consumer Tech',
  'Tech Guides & How-To',
  'Platform Ecosystems',
  'Privacy & Policy',
  'Swedish (Feber)',
];

interface NavigationTabsProps {
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({ activeTab, onSelectTab }) => {
  const { feeds, articles } = useFeeds();
  const { filters, updateFilter } = useFilter();
  const { settings } = useSettings();

  const unreadCount = articles.filter((a) => !a.read).length;
  const bookmarkedCount = articles.filter((a) => a.bookmarked).length;

  const categories = useMemo(() => {
    const feedCategories = Array.from(new Set(feeds.map((f) => f.category))).filter(Boolean);
    const combined = Array.from(new Set([...ORDERED_PRIMARY_CATEGORIES.slice(1), ...feedCategories]));
    return ['All', ...combined];
  }, [feeds]);

  // Unread articles per feed category, shown in the category dropdown
  const unreadByCategory = useMemo(() => {
    const categoryOf = new Map(feeds.map((f) => [f.id, f.category]));
    const counts: Record<string, number> = {};
    for (const a of articles) {
      const category = categoryOf.get(a.sourceId);
      if (!a.read && category) counts[category] = (counts[category] || 0) + 1;
    }
    return counts;
  }, [feeds, articles]);

  const tabs: { id: ActiveNavTab; label: string; icon: React.ReactNode; badge?: number; badgeColor?: string }[] = [
    { id: 'newspaper', label: 'Newspaper', icon: <Newspaper className="w-4 h-4" /> },
    { id: 'latest', label: 'Latest', icon: <Clock className="w-4 h-4" /> },
    {
      id: 'unread',
      label: 'Unread',
      icon: <Inbox className="w-4 h-4" />,
      badge: unreadCount > 0 ? unreadCount : undefined,
      badgeColor: 'bg-theme-accent text-white',
    },
    { id: 'briefing', label: 'Briefing', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'ransomware', label: 'Ransomware', icon: <Skull className="w-4 h-4" /> },
    { id: 'vulnerabilities', label: 'Vulns', icon: <ShieldAlert className="w-4 h-4" /> },
    {
      id: 'bookmarks',
      label: 'Saved',
      icon: <Bookmark className="w-4 h-4" />,
      badge: bookmarkedCount > 0 ? bookmarkedCount : undefined,
      badgeColor: 'bg-theme-card text-theme-text border border-theme-border',
    },
  ];

  const handleCategoryChange = (cat: string) => {
    updateFilter('selectedCategory', cat === 'All' ? null : cat);
    if (activeTab !== 'newspaper' && activeTab !== 'latest' && activeTab !== 'unread') {
      onSelectTab('newspaper');
    }
  };

  const handleWatchlistToggle = () => {
    updateFilter('watchlistOnly', !filters.watchlistOnly);
    if (activeTab !== 'newspaper' && activeTab !== 'latest' && activeTab !== 'unread') {
      onSelectTab('newspaper');
    }
  };

  return (
    <>
      {/* Desktop Navigation & Category/Watchlist Bar */}
      <nav className="bg-theme-surface border-b border-theme-border hidden sm:block">
        <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Left: Navigation Tabs */}
          <div className="flex items-center space-x-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`px-3 py-2.5 font-mono text-xs font-semibold tracking-wider uppercase transition-colors relative flex items-center gap-1.5 border-b-2 ${
                    isActive
                      ? 'border-theme-accent text-theme-accent'
                      : 'border-transparent text-theme-text-muted hover:text-theme-text hover:border-theme-border'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold leading-tight ${tab.badgeColor}`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: Category Dropdown & Watchlist Button */}
          <div className="flex items-center gap-2 py-1.5 flex-shrink-0">
            {/* Category Dropdown */}
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="nav-category-select"
                className="text-[11px] font-mono uppercase tracking-wider text-theme-text-muted hidden md:inline"
              >
                Category:
              </label>
              <select
                id="nav-category-select"
                value={filters.selectedCategory || 'All'}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="bg-theme-card border border-theme-border rounded px-2.5 py-1 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent transition-colors max-w-[170px] sm:max-w-[210px] truncate"
              >
                <option value="All">All Categories</option>
                {categories
                  .filter((c) => c !== 'All')
                  .map((category) => (
                    <option key={category} value={category}>
                      {category}{unreadByCategory[category] ? ` (${unreadByCategory[category]})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            {/* Watchlist Quick Toggle Button */}
            <button
              onClick={handleWatchlistToggle}
              title="Show only articles matching your watchlist keywords"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all uppercase tracking-wider font-bold ${
                filters.watchlistOnly
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>Watchlist</span>
              {settings.watchlistKeywords.length > 0 && (
                <span
                  className={`text-[10px] px-1 rounded-full ${
                    filters.watchlistOnly
                      ? 'bg-black text-amber-500'
                      : 'bg-amber-500/20 text-amber-500'
                  }`}
                >
                  {settings.watchlistKeywords.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Category Dropdown & Watchlist Bar (Visible on mobile above search bar) */}
      <div className="sm:hidden bg-theme-surface border-b border-theme-border px-3 py-1.5 flex items-center justify-between gap-2 text-xs font-mono">
        <select
          value={filters.selectedCategory || 'All'}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="bg-theme-card border border-theme-border rounded px-2 py-1 text-xs font-mono text-theme-text flex-grow max-w-[62%]"
        >
          <option value="All">All Categories</option>
          {categories
            .filter((c) => c !== 'All')
            .map((category) => (
              <option key={category} value={category}>
                {category}{unreadByCategory[category] ? ` (${unreadByCategory[category]})` : ''}
              </option>
            ))}
        </select>

        <button
          onClick={handleWatchlistToggle}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold uppercase ${
            filters.watchlistOnly
              ? 'bg-amber-500 text-black'
              : 'text-amber-500 bg-amber-500/10 border border-amber-500/30'
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          <span>Watchlist</span>
        </button>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-theme-surface/95 backdrop-blur-md border-t border-theme-border flex items-center justify-around py-1.5 px-2 safe-area-pb">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex flex-col items-center justify-center p-1 relative flex-1 ${
                isActive ? 'text-theme-accent' : 'text-theme-text-muted'
              }`}
            >
              <div className="relative">
                {tab.icon}
                {tab.badge !== undefined && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 text-[9px] px-1 rounded-full font-bold ${tab.badgeColor}`}
                  >
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="font-mono text-[9px] uppercase tracking-wider mt-0.5">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
