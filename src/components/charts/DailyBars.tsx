import React from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;

const dayLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * A count per day as small vertical bars, oldest left and today right (e.g. dailyCounts' output), with a
 * dashed line at the peak, a tooltip per day and the first and last dates under the axis. Days without any
 * get a stub on the baseline, so the run of days stays readable.
 */
export const DailyBars: React.FC<{ values: number[]; ariaLabel: string; unit: string; now?: number; className?: string }> = ({
  values, ariaLabel, unit, now = Date.now(), className = 'fill-theme-accent',
}) => {
  const width = 300;
  const height = 56;
  const top = 6; // room above the peak line
  const max = Math.max(1, ...values);
  const slot = width / Math.max(1, values.length);
  const gap = slot > 4 ? 1.5 : 0.5;
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const dayAt = (i: number) => today.getTime() - (values.length - 1 - i) * DAY_MS;
  const total = values.reduce((sum, n) => sum + n, 0);

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16" preserveAspectRatio="none" role="img" aria-label={`${ariaLabel}: ${total} ${unit} in ${values.length} days`}>
        <line x1={0} x2={width} y1={top} y2={top} className="stroke-theme-border" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} className="stroke-theme-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {values.map((n, i) => {
          const h = n ? Math.max(2, (n / max) * (height - top)) : 1.5;
          return (
            <g key={i}>
              <title>{`${dayLabel(dayAt(i))}: ${n} ${unit}`}</title>
              {/* Full-height hit area so short bars still show their tooltip */}
              <rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
              <rect x={i * slot + gap / 2} y={height - h} width={Math.max(0.5, slot - gap)} height={h} rx={Math.min(1.5, slot / 4)} className={className} opacity={n ? (i === values.length - 1 ? 1 : 0.8) : 0.25} />
            </g>
          );
        })}
      </svg>
      <figcaption className="flex justify-between gap-2 text-[10px] font-mono text-theme-text-muted mt-1">
        <span>{dayLabel(dayAt(0))}</span>
        <span>peak {max === 1 && !values.some(Boolean) ? 0 : max} a day</span>
        <span>today</span>
      </figcaption>
    </figure>
  );
};
