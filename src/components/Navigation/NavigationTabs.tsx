import React from 'react';
import { ActiveNavTab } from '../../types';
import { useFeeds } from '../../context/FeedContext';
import {
  Newspaper,
  Clock,
  Inbox,
  Bookmark,
  Radio,
  Activity,
  Settings as SettingsIcon,
} from 'lucide-react';

interface NavigationTabsProps {
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({ activeTab, onSelectTab }) => {
  const { articles, feedHealth } = useFeeds();

  const unreadCount = articles.filter((a) => !a.read).length;
  const bookmarkedCount = articles.filter((a) => a.bookmarked).length;

  const errorFeedsCount = Object.values(feedHealth).filter(
    (h) => h.status !== 'healthy'
  ).length;

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
    {
      id: 'bookmarks',
      label: 'Saved',
      icon: <Bookmark className="w-4 h-4" />,
      badge: bookmarkedCount > 0 ? bookmarkedCount : undefined,
      badgeColor: 'bg-theme-card text-theme-text border border-theme-border',
    },
    { id: 'sources', label: 'Sources', icon: <Radio className="w-4 h-4" /> },
    {
      id: 'health',
      label: 'Health',
      icon: <Activity className="w-4 h-4" />,
      badge: errorFeedsCount > 0 ? errorFeedsCount : undefined,
      badgeColor: 'bg-amber-600 text-white',
    },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="w-4 h-4" /> },
  ];

  return (
    <>
      {/* Desktop Top Navigation Bar */}
      <nav className="bg-theme-surface border-b border-theme-border hidden sm:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
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
        </div>
      </nav>

      {/* Mobile Bottom Navigation Bar (Requirement 20: Mobile can use bottom navigation) */}
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
