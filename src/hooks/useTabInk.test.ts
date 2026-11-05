import { describe, expect, it } from 'vitest';
import { inkTransform } from './useTabInk';

describe('inkTransform', () => {
  it('moves the 1px ink to the tab and stretches it to the tab width', () => {
    expect(inkTransform(0, 80)).toBe('translateX(0px) scaleX(80)');
    expect(inkTransform(124, 46)).toBe('translateX(124px) scaleX(46)');
  });

  it('rises to the tab\'s row when the strip wraps', () => {
    expect(inkTransform(12, 60, 37)).toBe('translate(12px, -37px) scaleX(60)');
    expect(inkTransform(12, 60, 0)).toBe('translateX(12px) scaleX(60)');
  });
});
