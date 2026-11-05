import React from 'react';
import { ChartEmpty } from './ChartEmpty';

/** Vertical bars for `bucketize` output, with every bucket's range labelled under its bar (the buckets may differ in width) and a tooltip per bucket */
export const Histogram: React.FC<{
  title: string; buckets: { from: number; to: number; count: number }[]; color?: string; animate?: boolean; ariaSummary?: string;
  /** Formats a bucket edge for the labels, tooltips and spoken summary */
  formatEdge?: (n: number) => string;
}> = ({ title, buckets, color = 'fill-theme-accent', animate = true, ariaSummary, formatEdge = String }) => {
  const total = buckets.reduce((n, b) => n + b.count, 0);
  if (buckets.length === 0 || total === 0) return <ChartEmpty />;
  const width = 300;
  const height = 64;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const slot = width / buckets.length;
  const range = (b: { from: number; to: number }) => `${formatEdge(b.from)}–${formatEdge(b.to)}`;
  const summary = ariaSummary ?? `${title}: ${buckets.map((b) => `${range(b)} ${b.count}`).join(', ')}`;

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16" preserveAspectRatio="none" role="img" aria-label={summary}>
        <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} className="stroke-theme-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {buckets.map((b, i) => {
          const h = b.count ? Math.max(2, (b.count / max) * (height - 4)) : 0;
          return (
            <g key={i}>
              <title>{`${range(b)}: ${b.count}`}</title>
              <rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
              {h > 0 && <rect x={i * slot + 1} y={height - h} width={Math.max(0.5, slot - 2)} height={h} rx={1.5} className={`${color}${animate ? ' chart-grow' : ''}`} />}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-[10px] font-mono text-theme-text-muted mt-1">
        <div className="grid text-center" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}>
          {buckets.map((b, i) => <span key={i} className="truncate" data-bucket-label>{range(b)}</span>)}
        </div>
        <div className="text-right">peak {max}</div>
      </figcaption>
    </figure>
  );
};
