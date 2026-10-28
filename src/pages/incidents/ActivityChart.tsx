import React, { useMemo } from 'react';
import { LeakSiteVictim } from '../../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Leak-site posts per day over the last `days` days; days inside the selected range are highlighted. */
export const ActivityChart: React.FC<{ victims: LeakSiteVictim[]; days?: number; highlightDays: number }> = ({ victims, days = 30, highlightDays }) => {
  const buckets = useMemo(() => {
    const today = Math.floor(Date.now() / DAY_MS);
    const counts = new Array(days).fill(0);
    for (const v of victims) {
      const offset = today - Math.floor(new Date(v.discoveredAt).getTime() / DAY_MS);
      if (offset >= 0 && offset < days) counts[days - 1 - offset]++;
    }
    return counts.map((count, i) => ({ count, date: new Date((today - (days - 1 - i)) * DAY_MS) }));
  }, [victims, days]);

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const width = 600;
  const height = 90;
  const bar = width / days;

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24" role="img" aria-label={`Leak-site posts per day, last ${days} days`}>
        {buckets.map((b, i) => {
          const h = (b.count / max) * (height - 4);
          const inRange = i >= days - highlightDays;
          return (
            <rect key={i} x={i * bar + 1} y={height - h} width={bar - 2} height={Math.max(h, b.count ? 1 : 0)} rx="1.5"
              className={inRange ? 'fill-rose-500' : 'fill-rose-500/30'}>
              <title>{`${b.date.toISOString().slice(0, 10)}: ${b.count} victim${b.count === 1 ? '' : 's'}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="flex justify-between text-[10px] font-mono text-theme-text-muted mt-1">
        <span>{buckets[0]?.date.toISOString().slice(5, 10)}</span>
        <span>peak {max}/day</span>
        <span>today</span>
      </figcaption>
    </figure>
  );
};
