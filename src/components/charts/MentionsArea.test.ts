import { describe, expect, it } from 'vitest';
import { monotonePath } from './MentionsArea';

const numbers = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);

describe('monotonePath', () => {
  it('passes through every point', () => {
    const d = monotonePath([[0, 10], [10, 0], [20, 5]]);
    expect(d.startsWith('M0,10')).toBe(true);
    expect(d).toContain(' 10,0 C');
    expect(d.endsWith(' 20,5')).toBe(true);
  });

  it('keeps flat runs flat, so an empty week stays on the baseline', () => {
    const d = monotonePath([[0, 50], [10, 50], [20, 0], [30, 50], [40, 50]]);
    // No control point goes below the baseline (y = 50) or above the peak (y = 0)
    const ys = numbers(d).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(50);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });

  it('copes with one point or none', () => {
    expect(monotonePath([[3, 4]])).toBe('M3,4');
    expect(monotonePath([])).toBe('');
  });
});
