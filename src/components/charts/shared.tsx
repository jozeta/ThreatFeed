import React, { useLayoutEffect, useState } from 'react';

/**
 * What the panel charts share: the severity palette, the measured width that keeps SVG marks round at any
 * panel width, and the HTML tooltip that stays inside its chart.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unscored';

// Solid marks; the bands behind them use the same hues, faintly
export const SEVERITY_DOT: Record<Severity, string> = {
  critical: 'fill-rose-600',
  high: 'fill-orange-500',
  medium: 'fill-amber-500 dark:fill-amber-400',
  low: 'fill-emerald-500',
  unscored: 'fill-slate-400',
};
export const SEVERITY_STROKE: Record<Severity, string> = {
  critical: 'stroke-rose-600',
  high: 'stroke-orange-500',
  medium: 'stroke-amber-500 dark:stroke-amber-400',
  low: 'stroke-emerald-500',
  unscored: 'stroke-slate-400',
};
export const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', unscored: 'Unscored' };

export const severityOf = (cvss: number | undefined): Severity =>
  cvss === undefined || !(cvss > 0) ? 'unscored' : cvss >= 9 ? 'critical' : cvss >= 7 ? 'high' : cvss >= 4 ? 'medium' : 'low';

/**
 * The element's width, following resizes (a fallback where ResizeObserver is missing, as in tests). A callback
 * ref, so a chart that first renders nothing still gets measured once its element appears.
 */
export function useWidth<T extends HTMLElement>(fallback: number): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    if (!el) return;
    if (el.clientWidth) setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width) setWidth(Math.round(entry.contentRect.width)); });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, width];
}

/**
 * A small card over the chart at (x, y) in the container's pixels: above the point, flipped below near the top,
 * and shifted sideways so it never leaves the chart (or the panel).
 */
export const ChartTooltip: React.FC<{ x: number; y: number; width: number; box?: number; room?: number; children: React.ReactNode }> = ({
  x, y, width, box = 232, room = 92, children,
}) => {
  const left = Math.min(Math.max(0, x - box / 2), Math.max(0, width - box));
  const below = y < room; // too close to the top for the card to fit above
  return (
    <div
      role="status"
      className="chart-tooltip pointer-events-none absolute z-10 rounded-md border border-theme-border-strong px-2.5 py-2 text-[11px] font-mono text-theme-text shadow-lg"
      style={{ left, width: box, ...(below ? { top: y + 14 } : { bottom: `calc(100% - ${y - 14}px)` }) }}
    >
      {children}
    </div>
  );
};

/** A legend swatch: a dot, a ring or a diamond, in the chart's own marks */
export const LegendMark: React.FC<{ kind: 'dot' | 'ring' | 'diamond' | 'dash'; className?: string }> = ({ kind, className = '' }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
    {kind === 'dot' && <circle cx={6} cy={6} r={4} className={className} />}
    {kind === 'ring' && <><circle cx={6} cy={6} r={2.5} className="fill-theme-text-muted" /><circle cx={6} cy={6} r={5} fill="none" strokeWidth={1.2} className="stroke-theme-text-muted" /></>}
    {kind === 'diamond' && <rect x={3} y={3} width={6} height={6} transform="rotate(45 6 6)" className="fill-theme-text stroke-theme-card" strokeWidth={1} />}
    {kind === 'dash' && <line x1={0} x2={12} y1={6} y2={6} strokeDasharray="2 2" strokeWidth={1.5} className="stroke-slate-400" />}
  </svg>
);
