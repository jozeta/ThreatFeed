import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActiveNavTab } from '../../types';
import { useFeeds } from '../../context/FeedContext';
import { useFilter } from '../../context/FilterContext';
import { useSettings } from '../../context/SettingsContext';
import { useAlertFeed } from '../../hooks/useAlertFeed';
import {
  Newspaper,
  Clock,
  Inbox,
  Bookmark,
  Target,
  ClipboardList,
  Skull,
  ShieldAlert,
  Crosshair,
  TrendingUp,
  MoreHorizontal,
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

// The phone's bottom bar has room for five; every other tab (including ones added later) goes under "More"
const MOBILE_PRIMARY: ActiveNavTab[] = ['newspaper', 'briefing', 'feed', 'vulnerabilities'];

interface NavigationTabsProps {
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({ activeTab, onSelectTab }) => {
  const { feeds, articles } = useFeeds();
  const { filters, updateFilter } = useFilter();
  const { settings } = useSettings();
  const { newCount } = useAlertFeed();
  const feedNewCount = newCount.news + newCount.vulns;

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
    { id: 'trends', label: 'Trends', icon: <TrendingUp className="w-4 h-4" /> },
    {
      id: 'feed',
      label: 'My Feed',
      icon: <Inbox className="w-4 h-4" />,
      badge: feedNewCount > 0 ? feedNewCount : undefined,
      badgeColor: 'bg-theme-accent text-white',
    },
    { id: 'ransomware', label: 'Ransomware', icon: <Skull className="w-4 h-4" /> },
    { id: 'actors', label: 'Actors', icon: <Crosshair className="w-4 h-4" /> },
    { id: 'vulnerabilities', label: 'Vulns', icon: <ShieldAlert className="w-4 h-4" /> },
    {
      id: 'bookmarks',
      label: 'Saved',
      icon: <Bookmark className="w-4 h-4" />,
      badge: bookmarkedCount > 0 ? bookmarkedCount : undefined,
      badgeColor: 'bg-theme-card text-theme-text border border-theme-border',
    },
  ];

  const mobilePrimary = MOBILE_PRIMARY.map((id) => tabs.find((t) => t.id === id)).filter((t): t is (typeof tabs)[number] => Boolean(t));
  const mobileMore = tabs.filter((t) => !MOBILE_PRIMARY.includes(t.id));
  const moreActive = mobileMore.some((t) => t.id === activeTab);
  const moreBadge = mobileMore.reduce((sum, t) => sum + (t.badge ?? 0), 0);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

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
          {/* Left: Navigation Tabs. Ten don't fit beside the category and watchlist controls below xl, so
              there only the active tab shows its label (the others have it as a tooltip); the row scrolls
              rather than overflow if it still doesn't fit */}
          <div className="flex items-center space-x-1 min-w-0 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  title={tab.label}
                  aria-label={tab.badge !== undefined ? `${tab.label} (${tab.badge})` : tab.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 py-2.5 font-mono text-xs font-semibold tracking-wider uppercase transition-colors relative flex items-center gap-1.5 border-b-2 whitespace-nowrap flex-shrink-0 ${
                    isActive
                      ? 'border-theme-accent text-theme-accent'
                      : 'border-transparent text-theme-text-muted hover:text-theme-text hover:border-theme-border'
                  }`}
                >
                  {tab.icon}
                  <span className={isActive ? undefined : 'hidden xl:inline'}>{tab.label}</span>
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

      {/* Mobile Bottom Navigation Bar. Rendered into <body>: inside the header, whose backdrop blur and
          collapse transform make `position: fixed` relative to the header, it would sit under it instead
          of at the bottom of the screen. */}
      {createPortal(<>
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-theme-surface/95 backdrop-blur-md border-t border-theme-border flex items-center justify-around py-1.5 px-2 safe-area-pb">
          {mobilePrimary.map((tab) => (
            <MobileNavButton key={tab.id} label={tab.label} icon={tab.icon} badge={tab.badge} badgeColor={tab.badgeColor} active={activeTab === tab.id} onClick={() => onSelectTab(tab.id)} />
          ))}
          <MobileNavButton
            label="More"
            icon={<MoreHorizontal className="w-4 h-4" />}
            badge={moreBadge > 0 ? moreBadge : undefined}
            badgeColor="bg-theme-accent text-white"
            active={moreActive || moreOpen}
            onClick={() => setMoreOpen(!moreOpen)}
            ariaExpanded={moreOpen}
          />
        </nav>
        {moreOpen && (
          <div className="sm:hidden fixed inset-0 z-50 flex items-end modal-backdrop" onClick={() => setMoreOpen(false)} role="dialog" aria-modal="true" aria-label="More pages">
            <div className="w-full modal-glass [--glass-base:var(--color-surface)] rounded-t-xl !border-x-0 !border-b-0 p-3 pb-6 safe-area-pb" onClick={(e) => e.stopPropagation()}>
              <ul className="grid grid-cols-3 gap-2">
                {mobileMore.map((tab) => (
                  <li key={tab.id}>
                    <button
                      onClick={() => { setMoreOpen(false); onSelectTab(tab.id); }}
                      className={`w-full flex flex-col items-center gap-1 py-3 rounded border text-xs font-mono uppercase tracking-wider ${
                        activeTab === tab.id ? 'border-theme-accent text-theme-accent' : 'border-theme-border text-theme-text'
                      }`}
                    >
                      <span className="relative">
                        {tab.icon}
                        {tab.badge !== undefined && (
                          <span className={`absolute -top-1.5 -right-3 text-[9px] px-1 rounded-full font-bold ${tab.badgeColor}`}>{tab.badge > 99 ? '99+' : tab.badge}</span>
                        )}
                      </span>
                      <span className="text-[10px]">{tab.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </>, document.body)}
    </>
  );
};

const MobileNavButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  badge?: number;
  badgeColor?: string;
  active: boolean;
  onClick: () => void;
  ariaExpanded?: boolean;
}> = ({ label, icon, badge, badgeColor, active, onClick, ariaExpanded }) => (
  <button
    onClick={onClick}
    aria-expanded={ariaExpanded}
    className={`flex flex-col items-center justify-center p-1 relative flex-1 min-w-0 ${active ? 'text-theme-accent' : 'text-theme-text-muted'}`}
  >
    <div className="relative">
      {icon}
      {badge !== undefined && (
        <span className={`absolute -top-1.5 -right-2.5 text-[9px] px-1 rounded-full font-bold ${badgeColor}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </div>
    <span className="font-mono text-[9px] uppercase tracking-wider mt-0.5 truncate max-w-full">{label}</span>
  </button>
);
