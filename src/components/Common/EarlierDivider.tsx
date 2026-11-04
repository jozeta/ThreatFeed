import React from 'react';

/** Thin labelled rule on Latest, where the stories from before the last visit begin */
export const EarlierDivider: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div role="separator" aria-label="Earlier" className={`flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-theme-accent ${className}`}>
    <span className="h-px flex-1 bg-theme-accent/40" />
    <span>Earlier</span>
    <span className="h-px flex-1 bg-theme-accent/40" />
  </div>
);
