import React, { useMemo } from 'react';
import { LeakSiteVictim } from '../../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAYS = 14;
const WEEKLY_AFTER_DAYS = 45; // beyond this, daily bars get too thin to read

/** A "nice" axis maximum: 1, 2 or 5 times a power of ten, at or above the value */
function niceMax(value: number): number {
  if (value <= 5) return 5;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].map((m) => m * power).find((n) => n >= value)!;
}

const fmt = (d: Date) => d.toISOString().slice(5, 10);

/**
 * Leak-site posts over time. The window adapts to the data: it starts at the first day there is history
 * for (`historyStart`, so filtering to one group doesn't shrink it) and grows up to `maxDays`; longer
 * windows switch from daily to weekly bars. Bars inside the selected range are highlighted.
 */
export const ActivityChart: React.FC<{ victims: LeakSiteVictim[]; historyStart?: string; maxDays?: number; highlightDays: number }> = ({
  victims, historyStart, maxDays = 90, highlightDays,
}) => {
  const today = Math.floor(Date.now() / DAY_MS);
  const firstDay = historyStart ? Math.floor(Date.parse(historyStart) / DAY_MS) : today - maxDays + 1;
  const days = Math.min(maxDays, Math.max(MIN_DAYS, today - firstDay + 1));
  const weekly = days > WEEKLY_AFTER_DAYS;
  const step = weekly ? 7 : 1;
  const bucketCount = Math.ceil(days / step);

  const buckets = useMemo(() => {
    // Buckets end today; with weekly bars the last one is the current (partial) 7 days
    const list = Array.from({ length: bucketCount }, (_, i) => {
      const end = today - (bucketCount - 1 - i) * step;
      return { start: end - step + 1, end, count: 0 };
    });
    for (const v of victims) {
      const day = Math.floor(new Date(v.discoveredAt).getTime() / DAY_MS);
      const i = bucketCount - 1 - Math.floor((today - day) / step);
      if (i >= 0 && i < bucketCount) list[i].count++;
    }
    return list;
  }, [victims, today, step, bucketCount]);

  const peak = Math.max(0, ...buckets.map((b) => b.count));
  const axisMax = niceMax(peak);
  // Average over buckets that have history (a group may have started posting mid-window)
  const average = buckets.reduce((sum, b) => sum + b.count, 0) / Math.max(1, buckets.length);

  const width = 600;
  const height = 110;
  const left = 0;
  const bar = width / bucketCount;
  const y = (n: number) => height - (n / axisMax) * (height - 6);
  const unit = weekly ? 'week' : 'day';

  return (
    <figure className="w-full">
      <div className="flex gap-1.5">
        {/* Axis labels in HTML: SVG text would be stretched along with the bars */}
        <div className="relative w-7 h-28 shrink-0 text-[10px] font-mono text-theme-text-muted text-right" aria-hidden="true">
          {[axisMax, axisMax / 2].map((n) => (
            <span key={n} className="absolute right-0 -translate-y-1/2" style={{ top: `${(y(n) / height) * 100}%` }}>{n}</span>
          ))}
        </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="flex-1 min-w-0 h-28" preserveAspectRatio="none" role="img"
        aria-label={`Leak-site posts per ${unit} over the last ${days} days`}>
        {[axisMax, axisMax / 2].map((n) => (
          <line key={n} x1={left} x2={width} y1={y(n)} y2={y(n)} className="stroke-theme-border" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        ))}
        {buckets.map((b, i) => {
          const h = height - y(b.count);
          const inRange = b.end > today - highlightDays;
          const label = weekly ? `${fmt(new Date(b.start * DAY_MS))} – ${fmt(new Date(b.end * DAY_MS))}` : new Date(b.end * DAY_MS).toISOString().slice(0, 10);
          return (
            <g key={b.end}>
              <title>{`${label}: ${b.count} victim${b.count === 1 ? '' : 's'}`}</title>
              <rect x={left + i * bar} y={0} width={bar} height={height} fill="transparent" />
              <rect x={left + i * bar + 1} y={height - h} width={Math.max(1, bar - 2)} height={Math.max(h, b.count ? 1 : 0)} rx="1.5"
                className={inRange ? 'fill-rose-500' : 'fill-rose-500/30'} />
            </g>
          );
        })}
        {average > 0 && (
          <line x1={left} x2={width} y1={y(average)} y2={y(average)} className="stroke-amber-500" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
            <title>{`Average: ${average.toFixed(1)} per ${unit}`}</title>
          </line>
        )}
      </svg>
      </div>
      <figcaption className="flex flex-wrap justify-between gap-2 text-[10px] font-mono text-theme-text-muted mt-1 pl-[2.125rem]">
        <span>{fmt(new Date(buckets[0].start * DAY_MS))}</span>
        <span>
          per {unit} · <span className="text-amber-500">avg {average.toFixed(average < 10 ? 1 : 0)}</span> · peak {peak}
          {days < maxDays && ` · history so far: ${days} of ${maxDays} days`}
        </span>
        <span>today</span>
      </figcaption>
    </figure>
  );
};
