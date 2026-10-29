import React from 'react';

export interface BarSegment {
  name: string;
  value: number;
  className: string; // SVG fill class, e.g. 'fill-rose-500'
}

export interface BarBucket {
  label: string; // full label for the tooltip, e.g. 2026-10-29
  short: string; // axis label
  segments: BarSegment[];
}

/** Vertical stacked bars (one per day or month), with a tooltip per bar and a small legend. */
export const StackedBars: React.FC<{ buckets: BarBucket[]; ariaLabel: string; unit: string; dimBefore?: number; format?: (n: number) => string }> = ({
  buckets, ariaLabel, unit, dimBefore = 0, format = String,
}) => {
  const totals = buckets.map((b) => b.segments.reduce((sum, s) => sum + s.value, 0));
  const max = Math.max(1, ...totals);
  const width = 600;
  const height = 110;
  const bar = width / Math.max(1, buckets.length);
  const legend = buckets[0]?.segments.filter((s) => buckets.some((b) => b.segments.find((x) => x.name === s.name)?.value)) ?? [];

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28" preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
        {buckets.map((b, i) => {
          let y = height;
          return (
            <g key={b.label} opacity={i < dimBefore ? 0.35 : 1}>
              <title>{`${b.label}: ${format(totals[i])} ${unit}${b.segments.length > 1 ? ` (${b.segments.filter((s) => s.value).map((s) => `${format(s.value)} ${s.name}`).join(', ')})` : ''}`}</title>
              {/* Transparent full-height hit area so thin bars still show their tooltip */}
              <rect x={i * bar} y={0} width={bar} height={height} fill="transparent" />
              {b.segments.map((s) => {
                const h = (s.value / max) * (height - 4);
                y -= h;
                return s.value > 0 ? <rect key={s.name} x={i * bar + 1} y={y} width={Math.max(1, bar - 2)} height={Math.max(h, 1)} className={s.className} /> : null;
              })}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap justify-between gap-2 text-[10px] font-mono text-theme-text-muted mt-1">
        <span>{buckets[0]?.short}</span>
        {legend.length > 1 && (
          <span className="flex flex-wrap gap-3">
            {legend.map((s) => (
              <span key={s.name} className="inline-flex items-center gap-1">
                <svg width="8" height="8" aria-hidden="true"><rect width="8" height="8" rx="1.5" className={s.className} /></svg>
                {s.name}
              </span>
            ))}
          </span>
        )}
        <span>peak {format(max)} · {buckets[buckets.length - 1]?.short}</span>
      </figcaption>
    </figure>
  );
};
