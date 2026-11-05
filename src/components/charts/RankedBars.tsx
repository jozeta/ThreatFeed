import React from 'react';
import { ChartEmpty } from './ChartEmpty';

/** Horizontal bars, largest first as given. Labels are untrusted and render as text only. */
export const RankedBars: React.FC<{
  title: string; data: { label: string; value: number }[]; max?: number; format?: (n: number) => string; color?: string; animate?: boolean; ariaSummary?: string;
}> = ({ title, data, max, format = String, color = 'fill-theme-accent', animate = true, ariaSummary }) => {
  const rows = data.filter((d) => d.value > 0);
  if (rows.length === 0) return <ChartEmpty />;
  const peak = Math.max(1, max ?? 0, ...rows.map((d) => d.value));
  const summary = ariaSummary ?? `${title}: ${rows.map((d) => `${d.label} ${format(d.value)}`).join(', ')}`;

  return (
    <figure className="w-full" role="img" aria-label={summary}>
      <ul className="space-y-1.5" aria-hidden="true">
        {rows.map((d, i) => (
          <li key={`${d.label}-${i}`} className="grid grid-cols-[minmax(0,40%)_1fr_auto] items-center gap-2 text-[11px] font-mono">
            <span className="truncate text-theme-text" title={d.label}>{d.label}</span>
            <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="w-full h-2">
              <rect width={100} height={8} rx={2} className="fill-theme-border" opacity={0.5} />
              <rect
                width={Math.max(1, (d.value / peak) * 100)} height={8} rx={2} className={`${color}${animate ? ' chart-grow-x' : ''}`}
                style={animate ? ({ '--chart-delay': `${i * 40}ms` } as React.CSSProperties) : undefined}
              />
            </svg>
            <span className="tabular-nums text-theme-text-muted">{format(d.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
};
