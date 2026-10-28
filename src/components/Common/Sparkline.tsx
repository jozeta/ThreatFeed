import React from 'react';

/** Tiny inline trend line for per-day counts (oldest first). Inherits colour via currentColor. */
export const Sparkline: React.FC<{ values: number[]; width?: number; height?: number; className?: string }> = ({
  values,
  width = 56,
  height = 16,
  className = '',
}) => {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 1 - (v / max) * (height - 2)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};
