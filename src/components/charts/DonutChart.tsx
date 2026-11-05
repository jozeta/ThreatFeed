import React from 'react';
import { ChartEmpty } from './ChartEmpty';
import type { Slice } from './chartData';

import { DONUT_COLORS, NEUTRAL_COLOR, seriesColors } from './colors';

export { DONUT_COLORS };

export const slicesSummary = (data: Slice[]) => data.map((s) => `${s.label} ${s.value} (${s.pct}%)`).join(', ');

/**
 * A donut of `foldSlices` output. Labels are untrusted, so they only ever render as text (legend, tooltip, aria).
 * The legend repeats every slice with its count and share, so colour is never the only carrier of meaning.
 */
export const DonutChart: React.FC<{
  title: string; data: Slice[]; colors?: string[]; centerLabel?: string; size?: number; animate?: boolean; ariaSummary?: string;
}> = ({ title, data, colors, centerLabel, size = 120, animate = true, ariaSummary }) => {
  if (data.length === 0) return <ChartEmpty />;
  const total = data.reduce((n, s) => n + s.value, 0);
  const stroke = size * 0.2;
  const r = (size - stroke) / 2;
  const c = size / 2;
  // Without explicit colours: rank colours, with "Other", "Unknown" and "No CWE" grey
  const palette = colors ?? seriesColors(data);
  const colorOf = (s: Slice, i: number) => (s.other ? NEUTRAL_COLOR : palette[i % palette.length]);
  let offset = 0;
  const summary = ariaSummary ?? `${title}: ${slicesSummary(data)}`;

  return (
    <figure className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={summary} className={`shrink-0${animate ? ' chart-fade' : ''}`}>
        {data.length === 1 ? (
          <circle cx={c} cy={c} r={r} fill="none" stroke={colorOf(data[0], 0)} strokeWidth={stroke}>
            <title>{`${data[0].label}: ${data[0].value} (${data[0].pct}%)`}</title>
          </circle>
        ) : data.map((s, i) => {
          const len = (s.value / total) * 100;
          const el = (
            <circle
              key={`${s.label}-${i}`} cx={c} cy={c} r={r} fill="none" stroke={colorOf(s, i)} strokeWidth={stroke}
              pathLength={100} strokeDasharray={`${Math.max(0, len - 0.6)} ${100 - Math.max(0, len - 0.6)}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${c} ${c})`}
            >
              <title>{`${s.label}: ${s.value} (${s.pct}%)`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        {centerLabel !== undefined && (
          <text x={c} y={c} textAnchor="middle" dominantBaseline="central" className="fill-theme-text font-mono" fontSize={size * 0.16}>{centerLabel}</text>
        )}
      </svg>
      <figcaption className="min-w-0 flex-1 text-[11px] font-mono text-theme-text-muted">
        <ul className="space-y-1">
          {data.map((s, i) => (
            <li key={`${s.label}-${i}`} className="flex items-center gap-2 min-w-0">
              <svg width="8" height="8" aria-hidden="true" className="shrink-0"><rect width="8" height="8" rx="1.5" fill={colorOf(s, i)} /></svg>
              <span className="truncate text-theme-text" title={s.label}>{s.label}</span>
              <span className="ml-auto tabular-nums">{s.value} · {s.pct}%</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
};
