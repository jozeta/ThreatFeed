import { describe, expect, it } from 'vitest';
import { bucketize, foldSlices, sliceTotal } from './chartData';

describe('foldSlices', () => {
  it('merges an input "Other" into the folded slice, once and last', () => {
    const items = [
      { label: ' other ', value: 9 }, { label: 'OTHER', value: 1 },
      ...Array.from({ length: 7 }, (_, i) => ({ label: `L${i}`, value: 20 - i })),
    ];
    const out = foldSlices(items);
    expect(out.filter((s) => /^other$/i.test(s.label.trim()))).toHaveLength(1);
    expect(out[out.length - 1]).toEqual({ label: 'Other', value: 9 + 1 + 14, pct: expect.any(Number), other: true });
    expect(out.reduce((n, s) => n + s.pct, 0)).toBe(100);
    // Nothing to fold: the given "Other" still comes last and is flagged
    expect(foldSlices([{ label: 'Other', value: 50 }, { label: 'a', value: 10 }])).toEqual([
      { label: 'a', value: 10, pct: 17 }, { label: 'Other', value: 50, pct: 83, other: true },
    ]);
  });

  it('slices fold to Other and percentages sum to 100', () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, value: 10 + i * 3 }));
    const out = foldSlices(items);
    expect(out).toHaveLength(7);
    expect(out[6]).toMatchObject({ label: 'Other', other: true, value: 10 + 13 + 16 });
    expect(out[0].label).toBe('L8');
    expect(out.slice(0, 6).every((s) => !s.other)).toBe(true);
    expect(out.reduce((n, s) => n + s.pct, 0)).toBe(100);
  });
  it('gives a single item 100 percent', () => {
    expect(foldSlices([{ label: 'a', value: 4 }])).toEqual([{ label: 'a', value: 4, pct: 100 }]);
  });
  it('returns [] when the total is 0 and drops zero and negative values', () => {
    expect(foldSlices([{ label: 'a', value: 0 }, { label: 'b', value: -3 }])).toEqual([]);
    expect(foldSlices([])).toEqual([]);
    expect(foldSlices([{ label: 'a', value: 5 }, { label: 'b', value: 0 }, { label: 'c', value: -1 }]).map((s) => s.label)).toEqual(['a']);
  });
  it('rounds ties stably: sums to 100 and earlier (larger-or-equal) slices win the extra point', () => {
    const out = foldSlices([{ label: 'a', value: 1 }, { label: 'b', value: 1 }, { label: 'c', value: 1 }]);
    expect(out.map((s) => s.pct)).toEqual([34, 33, 33]);
    const again = foldSlices([{ label: 'a', value: 1 }, { label: 'b', value: 1 }, { label: 'c', value: 1 }]);
    expect(again).toEqual(out);
  });
  it('honours a custom max', () => {
    const out = foldSlices([{ label: 'a', value: 3 }, { label: 'b', value: 2 }, { label: 'c', value: 1 }], 1);
    expect(out.map((s) => s.label)).toEqual(['a', 'Other']);
    expect(out[1].value).toBe(3);
  });
});

describe('bucketize', () => {
  it('counts values into half-open buckets with an inclusive last bucket', () => {
    const out = bucketize([0, 1, 1.9, 2, 3, 4, 5], [0, 2, 4]);
    expect(out).toEqual([{ from: 0, to: 2, count: 3 }, { from: 2, to: 4, count: 3 }]);
    expect(bucketize([4], [0, 2, 4])[1].count).toBe(1);
  });
  it('ignores values outside the edges and non-finite values', () => {
    expect(bucketize([-1, 5, NaN, 1], [0, 2, 4]).map((b) => b.count)).toEqual([1, 0]);
  });
  it('returns [] for fewer than two edges', () => {
    expect(bucketize([1], [0])).toEqual([]);
  });
});

describe('sliceTotal', () => {
  it('sums the slices, Other included', () => {
    expect(sliceTotal(foldSlices([{ label: 'a', value: 3 }, { label: 'b', value: 4 }], 1))).toBe('7');
    expect(sliceTotal([])).toBe('0');
  });
});
