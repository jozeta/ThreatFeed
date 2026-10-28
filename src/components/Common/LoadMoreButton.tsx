import React from 'react';
import { ChevronDown } from 'lucide-react';

interface LoadMoreButtonProps {
  remaining: number;
  onClick: () => void;
}

export const LoadMoreButton: React.FC<LoadMoreButtonProps> = ({ remaining, onClick }) => (
  <div className="flex justify-center pt-8 print:hidden">
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-theme-surface hover:bg-theme-card border border-theme-border hover:border-theme-accent text-theme-text text-xs font-mono font-bold transition-colors"
    >
      <ChevronDown className="w-3.5 h-3.5 text-theme-accent" />
      <span>Show more · {remaining} remaining</span>
    </button>
  </div>
);
