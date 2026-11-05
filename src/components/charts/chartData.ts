export interface Slice { label: string; value: number; pct: number; other?: true }

/**
 * The largest `max` items by value, the rest folded into one "Other"; zero and negative values dropped.
 * `pct` are whole numbers that sum to exactly 100 (largest remainder; ties go to the earlier slice).
 */
export function foldSlices(items: { label: string; value: number }[], max = 6): Slice[] {
  const kept = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = kept.reduce((n, i) => n + i.value, 0);
  if (total <= 0) return [];
  const rest = kept.slice(max);
  const rows: { label: string; value: number; other?: true }[] = kept.slice(0, max).map((i) => ({ label: i.label, value: i.value }));
  if (rest.length) rows.push({ label: 'Other', value: rest.reduce((n, i) => n + i.value, 0), other: true });
  const exact = rows.map((r) => (r.value / total) * 100);
  const pct = exact.map(Math.floor);
  let left = 100 - pct.reduce((n, p) => n + p, 0);
  const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    pct[i] += 1;
    left -= 1;
  }
  return rows.map((r, i) => ({ ...r, pct: pct[i] }));
}

/** The sum of the slices, as the donut's centre label */
export const sliceTotal = (slices: Slice[]) => slices.reduce((n, s) => n + s.value, 0).toLocaleString();

/** Histogram buckets between consecutive edges: [from, to) except the last, which includes its upper edge */
export function bucketize(values: number[], edges: number[]): { from: number; to: number; count: number }[] {
  if (edges.length < 2) return [];
  const buckets = edges.slice(1).map((to, i) => ({ from: edges[i], to, count: 0 }));
  const last = buckets.length - 1;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const idx = buckets.findIndex((b, i) => v >= b.from && (i === last ? v <= b.to : v < b.to));
    if (idx >= 0) buckets[idx].count += 1;
  }
  return buckets;
}
