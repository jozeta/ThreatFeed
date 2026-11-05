import React from 'react';

/** What every chart shows when it has nothing to draw */
export const ChartEmpty: React.FC<{ text?: string }> = ({ text = 'No data yet' }) => (
  <p className="text-[11px] font-mono text-theme-text-muted py-3">{text}</p>
);
