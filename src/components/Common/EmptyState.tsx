import React from 'react';
import { Newspaper, CheckCircle2, RefreshCw } from 'lucide-react';
import { useFilter } from '../../context/FilterContext';
import { useFeeds } from '../../context/FeedContext';

interface EmptyStateProps {
  message?: string;
  subtext?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message, subtext }) => {
  const { filters, resetFilters, hasActiveFilters } = useFilter();
  const { refreshFeeds, isRefreshing } = useFeeds();

  const isUnreadFilter = filters.readStatus === 'unread';

  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4 max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-full bg-theme-surface border border-theme-border flex items-center justify-center mb-5 text-theme-accent">
        {isUnreadFilter ? (
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        ) : (
          <Newspaper className="w-8 h-8 opacity-60" />
        )}
      </div>

      <h3 className="font-serif text-2xl font-bold text-theme-text mb-2">
        {message || (isUnreadFilter ? "You're all caught up." : 'No security reports found')}
      </h3>

      <p className="font-serif text-base text-theme-text-muted mb-6 leading-relaxed">
        {subtext ||
          (isUnreadFilter
            ? 'Check back later for new security intelligence and zero-day disclosures.'
            : hasActiveFilters
            ? 'No articles match your active search and filter criteria. Try adjusting or clearing your filters.'
            : 'No articles have been retrieved yet. Click refresh to ingest feeds.')}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="px-4 py-2 rounded font-mono text-xs uppercase tracking-wider bg-theme-surface border border-theme-border hover:border-theme-accent text-theme-text transition-colors"
          >
            Clear Active Filters
          </button>
        )}

        <button
          onClick={() => refreshFeeds()}
          disabled={isRefreshing}
          className="px-4 py-2 rounded font-mono text-xs uppercase tracking-wider bg-theme-accent text-white hover:bg-theme-accent-hover transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Updating...' : 'Refresh Feeds'}
        </button>
      </div>
    </div>
  );
};
