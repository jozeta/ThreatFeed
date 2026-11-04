import React from 'react';
import { Newspaper, List, LayoutGrid, CheckCheck, Tv, Hash, LayoutDashboard } from 'lucide-react';
import { useFeeds } from '../../context/FeedContext';
import { useSettings } from '../../context/SettingsContext';
import { useHashRoute } from '../../hooks/useHashRoute';
import { LayoutMode } from '../../types';
import { layoutLocked } from '../../utils/layout';
import { enterTv, tvAvailable } from '../tv/tvRoute';

interface ViewControlsProps {
  /** Display and placement classes of the row (the caller decides where it shows) */
  className: string;
  /** Always show the button labels (the Filter sheet has the room) */
  labelled?: boolean;
}

/** Layout switcher, TV / Dashboard modes and Mark Read. The header shows it from `sm` up; phones get it in the Filter sheet. */
export const ViewControls: React.FC<ViewControlsProps> = ({ className, labelled = false }) => {
  const { settings, updateSettings } = useSettings();
  const { markAllAsRead } = useFeeds();
  const [route] = useHashRoute();
  const layoutDisabled = layoutLocked(route);
  const handleLayoutChange = (mode: LayoutMode) => {
    updateSettings({ layout: mode });
  };
  const layoutButtonClass = (mode: LayoutMode) =>
    `p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      settings.layout === mode && !layoutDisabled
        ? 'bg-theme-surface text-theme-accent shadow-sm'
        : `text-theme-text-muted ${layoutDisabled ? '' : 'hover:text-theme-text'}`
    }`;
  const labelClass = (from: 'lg' | 'xl') => (labelled ? 'inline' : from === 'xl' ? 'hidden xl:inline' : 'hidden lg:inline');

  return (
  <div className={`${className} items-center gap-1 sm:gap-2`}>
    {/* Layout switcher buttons (Requirement 9) */}
    <div className="flex items-center border border-theme-border rounded-md p-0.5 bg-theme-card">
      <button
        onClick={() => handleLayoutChange('newspaper')}
        disabled={layoutDisabled}
        title="Newspaper Editorial Layout"
        aria-label="Newspaper Editorial Layout"
        className={layoutButtonClass('newspaper')}
      >
        <Newspaper className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleLayoutChange('list-thumbnails')}
        disabled={layoutDisabled}
        title="List + Thumbnails Layout"
        aria-label="List + Thumbnails Layout"
        className={layoutButtonClass('list-thumbnails')}
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleLayoutChange('list')}
        disabled={layoutDisabled}
        title="Compact List Layout"
        aria-label="Compact List Layout"
        className={layoutButtonClass('list')}
      >
        <List className="w-4 h-4" />
      </button>
    </div>

    {/* Full-screen modes, where the page offers them */}
    {(['tv', 'dash'] as const).filter((kind) => tvAvailable(route.page).includes(kind)).map((kind) => (
      <button
        key={kind}
        onClick={() => enterTv(kind)}
        title={kind === 'tv' ? 'TV mode' : 'Dashboard'}
        aria-label={kind === 'tv' ? 'TV mode' : 'Dashboard'}
        className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-md border border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text text-xs font-mono transition-colors flex items-center gap-1"
      >
        {kind === 'tv' ? <Tv className="w-4 h-4" /> : <LayoutDashboard className="w-4 h-4" />}
        <span className={labelClass('xl')}>{kind === 'tv' ? 'TV' : 'Dashboard'}</span>
      </button>
    ))}
    {/* Mixed mode: Latest news with the Vulns numbers mixed in */}
    {route.page === 'latest' && (
      <button
        onClick={() => enterTv('tv', { mix: '1' })}
        title="TV with numbers"
        aria-label="TV with numbers"
        className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-md border border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text text-xs font-mono transition-colors flex items-center gap-1"
      >
        <span className="relative">
          <Tv className="w-4 h-4" />
          <Hash className="w-2.5 h-2.5 absolute -right-1 -bottom-1 bg-theme-card rounded-sm" strokeWidth={3} />
        </span>
        <span className={labelClass('xl')}>TV+</span>
      </button>
    )}

    <div className="w-[1px] h-5 bg-theme-border mx-1 hidden sm:block" />

    {/* Mark all as read */}
    <button
      onClick={() => markAllAsRead()}
      title="Mark all as read"
      className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-md border border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text text-xs font-mono transition-colors flex items-center gap-1"
    >
      <CheckCheck className="w-4 h-4" />
      <span className={labelClass('lg')}>Mark Read</span>
    </button>
  </div>
  );
};
