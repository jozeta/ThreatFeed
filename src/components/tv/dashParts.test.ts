import { describe, expect, it } from 'vitest';
import { chartReady } from './dashParts';

describe('chartReady', () => {
  it('needs two points with any series above zero', () => {
    expect(chartReady([])).toBe(false);
    expect(chartReady([[3, 2], [0, 0]])).toBe(false);
    expect(chartReady([[3, 2], [0, 1]])).toBe(true);
    expect(chartReady([[0], [4], [0], [1]])).toBe(true);
  });
});
