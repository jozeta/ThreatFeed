import React, { useId, useState } from 'react';
import { useReducedMotion } from '../Common/SidePanel';
import { SectionTitle } from '../../pages/incidents/shared';
import { ChartTooltip, useWidth } from './shared';

const HEIGHT = 84;
const M = { left: 4, right: 4, top: 10, bottom: 4 };

const weekLabel = (week: string) => new Date(`${week}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * A smooth curve through the points that never overshoots them (monotone cubic, Fritsch–Carlson), so a week
 * without mentions stays on the baseline instead of dipping below it.
 */
export function monotonePath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  const n = pts.length;
  const slopes = pts.slice(1).map(([x, y], i) => (y - pts[i][1]) / (x - pts[i][0] || 1));
  const tangents = pts.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    const a = slopes[i - 1];
    const b = slopes[i];
    return a * b <= 0 ? 0 : (3 * a * b) / (Math.max(a, b) + 2 * Math.min(a, b)) || 0;
  });
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = (x1 - x0) / 3;
    d += ` C${x0 + h},${y0 + tangents[i] * h} ${x1 - h},${y1 - tangents[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

/**
 * News mentions per week (weeklySeries' output) as a soft area under a curve, with the peak marked, a hover
 * guide and tooltip per week, and the first week and this week under it.
 */
export const MentionsArea: React.FC<{ series: { week: string; count: number }[]; ariaLabel: string; unit?: string; className?: string }> = ({
  series, ariaLabel, unit = 'articles', className = 'text-theme-accent',
}) => {
  const [ref, width] = useWidth<HTMLDivElement>(480);
  const reduced = useReducedMotion();
  const gradient = useId();
  const [active, setActive] = useState<number | null>(null);
  if (series.length < 2) return null;

  const max = Math.max(1, ...series.map((s) => s.count));
  const total = series.reduce((sum, s) => sum + s.count, 0);
  const plotW = Math.max(1, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const pts: [number, number][] = series.map((s, i) => [M.left + (i / (series.length - 1)) * plotW, M.top + (1 - s.count / max) * plotH]);
  const line = monotonePath(pts);
  const base = M.top + plotH;
  const area = `${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`;
  const peak = series.findIndex((s) => s.count === max);
  const a = active !== null ? pts[active] : null;

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setActive(Math.min(series.length - 1, Math.max(0, Math.round(((x - M.left) / plotW) * (series.length - 1)))));
  };

  return (
    <figure className="w-full">
      <div ref={ref} className={`relative w-full rounded-lg border border-black/10 dark:border-white/10 bg-theme-surface ${className}`}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block select-none"
          role="img"
          aria-label={`${ariaLabel}: ${total} ${unit} in ${series.length} weeks, peak ${max} in the week of ${weekLabel(series[peak].week)}`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setActive(null)}
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.45} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <line x1={M.left} x2={M.left + plotW} y1={M.top} y2={M.top} className="stroke-theme-border" strokeDasharray="3 3" strokeWidth={1} />
          <line x1={M.left} x2={M.left + plotW} y1={base + 0.5} y2={base + 0.5} className="stroke-theme-border" strokeWidth={1} />
          <path d={area} fill={`url(#${gradient})`} className={reduced ? undefined : 'chart-fade'} />
          <path d={line} pathLength={1} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" className={reduced ? undefined : 'chart-draw'} />
          {/* The peak week */}
          <circle cx={pts[peak][0]} cy={pts[peak][1]} r={2.5} fill="currentColor" className={reduced ? undefined : 'chart-fade'} />
          {a && (
            <g className="pointer-events-none" aria-hidden="true">
              <line x1={a[0]} x2={a[0]} y1={M.top} y2={base} stroke="currentColor" strokeOpacity={0.4} strokeDasharray="2 2" />
              <circle cx={a[0]} cy={a[1]} r={4} fill="currentColor" className="stroke-theme-card" strokeWidth={1.5} />
            </g>
          )}
        </svg>
        {a && active !== null && (
          <ChartTooltip x={a[0]} y={a[1]} width={width} box={150} room={30}>
            <span className="text-theme-text-muted">Week of {weekLabel(series[active].week)}</span>
            <span className="block font-bold text-theme-text">{series[active].count} {series[active].count === 1 ? unit.replace(/s$/, '') : unit}</span>
          </ChartTooltip>
        )}
      </div>
      <figcaption className="flex justify-between gap-2 text-[10px] font-mono text-theme-text-muted mt-1">
        <span>{weekLabel(series[0].week)}</span>
        <span>{total} in {series.length} weeks · peak {max} a week</span>
        <span>this week</span>
      </figcaption>
    </figure>
  );
};

/** The panels' "News mentions per week" section; nothing until the history has two weeks */
export const MentionsSection: React.FC<{ series: { week: string; count: number }[]; name: string; className?: string }> = ({ series, name, className }) =>
  series.length < 2 || !series.some((s) => s.count) ? null : (
    <div>
      <SectionTitle>News mentions per week</SectionTitle>
      <MentionsArea series={series} ariaLabel={`Articles mentioning ${name} per week`} className={className} />
    </div>
  );
