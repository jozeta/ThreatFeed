import React from 'react';
import { ChartEmpty } from './ChartEmpty';

/** Vertical bars for `bucketize` output, with the bucket edges under the axis and a tooltip per bucket */
export const Histogram: React.FC<{
  title: string; buckets: { from: number; to: number; count: number }[]; color?: string; animate?: boolean; ariaSummary?: string;
}> = ({ title, buckets, color = 'fill-theme-accent', animate = true, ariaSummary }) => {
  const total = buckets.reduce((n, b) => n + b.count, 0);
  if (buckets.length === 0 || total === 0) return <ChartEmpty />;
  const width = 300;
  const height = 64;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const slot = width / buckets.length;
  const range = (b: { from: number; to: number }) => `${b.from}–${b.to}`;
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
      <figcaption className="flex justify-between gap-2 text-[10px] font-mono text-theme-text-muted mt-1">
        <span>{buckets[0].from}</span>
        <span>peak {max}</span>
        <span>{buckets[buckets.length - 1].to}</span>
      </figcaption>
    </figure>
  );
};
