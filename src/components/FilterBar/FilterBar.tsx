import React from 'react';
import { useFilter } from '../../context/FilterContext';
import { useFeeds } from '../../context/FeedContext';
import { X, Filter, Calendar, ArrowUpDown } from 'lucide-react';

const CATEGORIES = [
  'All',
  'Security News',
  'Vulnerabilities',
  'Threat Intelligence',
  'Malware',
  'Research',
  'Red Team',
  'Blue Team',
];

const POPULAR_TAGS = [
  'Ransomware',
  'Zero-Day',
  'CVE',
  'Exploit',
  'APT',
  'Malware',
  'Reverse Engineering',
  'Cloud Security',
  'Application Security',
  'Detection Engineering',
  'Incident Response',
];

interface FilterBarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({ isOpen, onClose }) => {
  const { filters, updateFilter, resetFilters, hasActiveFilters } = useFilter();
  const { feeds } = useFeeds();

  const handleCategorySelect = (cat: string) => {
    updateFilter('selectedCategory', cat === 'All' ? null : cat);
  };

  return (
    <div className="border-b border-theme-border/60 bg-theme-surface/50">
      {/* Horizontal Category Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 overflow-x-auto scrollbar-none flex items-center gap-1.5 text-xs font-mono">
        {CATEGORIES.map((category) => {
          const isSelected =
            (category === 'All' && !filters.selectedCategory) ||
            filters.selectedCategory?.toLowerCase() === category.toLowerCase();

          return (
            <button
              key={category}
              onClick={() => handleCategorySelect(category)}
              className={`px-3 py-1.5 rounded-full transition-all flex-shrink-0 uppercase tracking-wider ${
                isSelected
                  ? 'bg-theme-accent text-white font-bold shadow-sm'
                  : 'text-theme-text-muted hover:text-theme-text hover:bg-theme-card'
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>

      {/* Expanded Filter Panel */}
      {isOpen && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 border-t border-theme-border bg-theme-card/60 animate-fadeIn relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-theme-text-muted hover:text-theme-text p-1"
            title="Close filter panel"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-between mb-4 pb-2 border-b border-theme-border/60 pr-8">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-theme-accent" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-theme-text">
                FILTER INTELLIGENCE DISPATCHES
              </h3>
            </div>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="text-xs font-mono text-rose-500 hover:underline flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* 1. Source Filter */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
                Intelligence Source
              </label>
              <select
                value={filters.selectedSourceId || ''}
                onChange={(e) => updateFilter('selectedSourceId', e.target.value || null)}
                className="w-full bg-theme-surface border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
              >
                <option value="">All Sources ({feeds.length})</option>
                {feeds.map((feed) => (
                  <option key={feed.id} value={feed.id}>
                    {feed.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Read Status */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
                Reading Status
              </label>
              <div className="grid grid-cols-3 gap-1 bg-theme-surface p-1 rounded border border-theme-border text-xs font-mono">
                {(['all', 'unread', 'read'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => updateFilter('readStatus', status)}
                    className={`py-1 rounded uppercase tracking-wider transition-colors ${
                      filters.readStatus === status
                        ? 'bg-theme-accent text-white font-bold'
                        : 'text-theme-text-muted hover:text-theme-text'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Timeframe */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Timeframe</span>
              </label>
              <select
                value={filters.dateRange}
                onChange={(e) => updateFilter('dateRange', e.target.value as any)}
                className="w-full bg-theme-surface border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
              >
                <option value="all">All Time</option>
                <option value="today">Today (Past 24 Hours)</option>
                <option value="week">Past 7 Days</option>
                <option value="month">Past 30 Days</option>
              </select>
            </div>

            {/* 4. Sort Order */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2 flex items-center gap-1">
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>Sort By</span>
              </label>
              <select
                value={filters.sortBy}
                onChange={(e) => updateFilter('sortBy', e.target.value as any)}
                className="w-full bg-theme-surface border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
              >
                <option value="newest">Newest First (Publication Time)</option>
                <option value="oldest">Oldest First</option>
                <option value="recently_read">Recently Read</option>
                <option value="recently_viewed">Recently Viewed</option>
              </select>
            </div>
          </div>

          {/* Popular Tag Quick Filter Pills */}
          <div className="mt-4 pt-4 border-t border-theme-border/60">
            <span className="text-xs font-mono uppercase tracking-wider text-theme-text-muted block mb-2">
              Filter by Threat Topic:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_TAGS.map((tag) => {
                const isActive = filters.selectedTag?.toLowerCase() === tag.toLowerCase();
                return (
                  <button
                    key={tag}
                    onClick={() => updateFilter('selectedTag', isActive ? null : tag)}
                    className={`font-mono text-xs px-2.5 py-1 rounded transition-colors ${
                      isActive
                        ? 'bg-theme-accent text-white font-bold'
                        : 'bg-theme-surface text-theme-text-muted border border-theme-border hover:border-theme-accent hover:text-theme-text'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Chips Bar */}
      {hasActiveFilters && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-2 text-xs font-mono bg-theme-accent-subtle/30 border-t border-theme-border">
          <span className="text-theme-accent font-bold uppercase tracking-wider">
            Active Filters:
          </span>

          {filters.searchQuery && (
            <span className="inline-flex items-center gap-1 bg-theme-surface px-2 py-0.5 rounded border border-theme-border text-theme-text">
              Query: "{filters.searchQuery}"
              <X className="w-3 h-3 cursor-pointer hover:text-theme-accent" onClick={() => updateFilter('searchQuery', '')} />
            </span>
          )}

          {filters.selectedCategory && (
            <span className="inline-flex items-center gap-1 bg-theme-surface px-2 py-0.5 rounded border border-theme-border text-theme-text">
              Category: {filters.selectedCategory}
              <X className="w-3 h-3 cursor-pointer hover:text-theme-accent" onClick={() => updateFilter('selectedCategory', null)} />
            </span>
          )}

          {filters.selectedSourceId && (
            <span className="inline-flex items-center gap-1 bg-theme-surface px-2 py-0.5 rounded border border-theme-border text-theme-text">
              Source: {feeds.find(f => f.id === filters.selectedSourceId)?.name || filters.selectedSourceId}
              <X className="w-3 h-3 cursor-pointer hover:text-theme-accent" onClick={() => updateFilter('selectedSourceId', null)} />
            </span>
          )}

          {filters.selectedTag && (
            <span className="inline-flex items-center gap-1 bg-theme-surface px-2 py-0.5 rounded border border-theme-border text-theme-text">
              Tag: #{filters.selectedTag}
              <X className="w-3 h-3 cursor-pointer hover:text-theme-accent" onClick={() => updateFilter('selectedTag', null)} />
            </span>
          )}

          {filters.readStatus !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-theme-surface px-2 py-0.5 rounded border border-theme-border text-theme-text">
              Status: {filters.readStatus}
              <X className="w-3 h-3 cursor-pointer hover:text-theme-accent" onClick={() => updateFilter('readStatus', 'all')} />
            </span>
          )}

          {filters.dateRange !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-theme-surface px-2 py-0.5 rounded border border-theme-border text-theme-text">
              Date: {filters.dateRange}
              <X className="w-3 h-3 cursor-pointer hover:text-theme-accent" onClick={() => updateFilter('dateRange', 'all')} />
            </span>
          )}

          <button
            onClick={resetFilters}
            className="text-theme-accent hover:underline font-bold ml-auto"
          >
            Clear All
          </button>
        </div>
      )}
    </div>
  );
};
