import { ReactNode, useState } from 'react';
import type { BarBucket } from '../charts/StackedBars';
import { NUMBER_SHAPES, PanelDef, WIDE_SHAPES } from './DashboardWall';

/**
 * What the dashboards' panel pools share. A pool builder decides which panels exist from the data it is given (once
 * per cycle); each panel computes its own figures from `fresh()` when it mounts, so every arrival shows the latest data.
 */

/** Remembers the last result while the inputs are the same objects and the clock is within the same 5 s */
export function memoLast<C extends { now: number }, R>(compute: (c: C) => R): (c: C) => R {
  let keys: unknown[] = [];
  let last: R;
  return c => {
    const next = [...Object.values(c).filter(v => typeof v === 'object'), Math.floor(c.now / 5000)];
    if (next.length !== keys.length || next.some((v, i) => v !== keys[i])) {
      keys = next;
      last = compute(c);
    }
    return last;
  };
}

/** Computes its data once, when it mounts (a panel remounts on every arrival) */
export function OnArrival<T>({ compute, view }: { compute: () => T; view: (data: T) => ReactNode }) {
  const [data] = useState(compute);
  return <>{view(data)}</>;
}

export function pool<C extends { now: number }, D>(ctx: C, fresh: () => C, data: (c: C) => D) {
  const out: PanelDef[] = [];
  const add = (id: string, wide: boolean, has: boolean, view: (d: D, now: number) => ReactNode) => {
    if (!has) return;
    out.push({
      id,
      weight: 1,
      shapes: wide ? WIDE_SHAPES : NUMBER_SHAPES,
      render: () => (
        <OnArrival
          compute={() => { const c = fresh(); return { d: data(c), now: c.now }; }}
          view={({ d, now }) => view(d, now)}
        />
      ),
    });
  };
  return { out, add, first: data(ctx) };
}

export type AddPanel<D> = (id: string, wide: boolean, has: boolean, view: (d: D, now: number) => ReactNode) => void;

export const sum = (ns: number[]) => ns.reduce((n, v) => n + v, 0);
export const dayTotals = (buckets: BarBucket[]) => buckets.map(b => sum(b.segments.map(s => s.value)));
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "3 Aug", or with the weekday "Mon 3 Aug" (UTC); a YYYY-MM-DD day or a full timestamp */
export const shortDate = (iso: string, weekday = false) => {
  const t = Date.parse(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if (isNaN(t)) return '';
  const d = new Date(t);
  return `${weekday ? WEEKDAY[d.getUTCDay()] + ' ' : ''}${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
export const dayLabel = (b: BarBucket) => shortDate(b.label);
