import { describe, it, expect } from 'vitest';
import { cellDelayMs, SPEED_FACTOR, wallOutMs } from './wallMotion';

describe('animation speed', () => {
  it('fast keeps the original timings', () => {
    expect(wallOutMs(false, 'fade', 'fast')).toBe(450);
    expect(wallOutMs(false, 'reveal', 'fast')).toBe(250);
    expect(cellDelayMs('reveal', 2, 'fast')).toBe(240);
  });
  it('slow and medium stretch the out phase and the reveal stagger by the same factor as the CSS', () => {
    expect(wallOutMs(false, 'slide', 'slow')).toBe(450 * SPEED_FACTOR.slow);
    expect(wallOutMs(false, 'reveal', 'medium')).toBe(250 * SPEED_FACTOR.medium);
    expect(cellDelayMs('reveal', 2, 'slow')).toBe(240 * SPEED_FACTOR.slow);
    expect(cellDelayMs('fade', 2, 'slow')).toBe(0);
  });
  it('reduce motion ignores the speed', () => {
    expect(wallOutMs(true, 'fade', 'slow')).toBe(wallOutMs(true, 'fade', 'fast'));
  });
});
