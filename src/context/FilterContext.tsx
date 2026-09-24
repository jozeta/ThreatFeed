import React, { createContext, useContext, useState } from 'react';
import { FilterState } from '../types';

export const INITIAL_FILTERS: FilterState = {
  searchQuery: '',
  selectedCategory: null,
  selectedSourceId: null,
  selectedTag: null,
  readStatus: 'all',
  viewedStatus: 'all',
  bookmarkedOnly: false,
  dateRange: 'all',
  sortBy: 'newest',
};

interface FilterContextType {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  resetFilters: () => void;
  hasActiveFilters: boolean;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const hasActiveFilters = Boolean(
    filters.searchQuery ||
    filters.selectedCategory ||
    filters.selectedSourceId ||
    filters.selectedTag ||
    filters.readStatus !== 'all' ||
    filters.viewedStatus !== 'all' ||
    filters.bookmarkedOnly ||
    filters.dateRange !== 'all' ||
    filters.sortBy !== 'newest'
  );

  return (
    <FilterContext.Provider value={{ filters, setFilters, updateFilter, resetFilters, hasActiveFilters }}>
      {children}
    </FilterContext.Provider>
  );
};

export function useFilter(): FilterContextType {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
}
