import { describe, expect, it } from 'vitest';
import { fitGridItems, layoutLocked, newspaperModes } from './layout';
import { parseHash } from '../hooks/useHashRoute';

describe('layoutLocked', () => {
  it('locks the layout buttons only on My Feed → Vulns', () => {
    expect(layoutLocked(parseHash('#/feed/vulns'))).toBe(true);
    expect(layoutLocked(parseHash('#/feed/vulns?rule=x'))).toBe(true);
    expect(layoutLocked(parseHash('#/feed/news'))).toBe(false);
    expect(layoutLocked(parseHash('#/feed'))).toBe(false); // defaults to the News sub-tab
    expect(layoutLocked(parseHash('#/latest'))).toBe(false);
    expect(layoutLocked(parseHash('#/'))).toBe(false);
  });
});

describe('newspaperModes', () => {
  const saved = { sectionsEnabled: true, clusteringEnabled: true };

  it('uses the saved front-page settings for the regular newspaper', () => {
    expect(newspaperModes(false, saved, { sections: false, clustering: false })).toEqual({ sections: true, clustering: true });
    expect(newspaperModes(false, { sectionsEnabled: undefined, clusteringEnabled: false }, { sections: true, clustering: true }))
      .toEqual({ sections: true, clustering: false }); // sections default on when never saved
  });

  it('ignores the saved settings in chronological views and follows the view’s own toggles', () => {
    expect(newspaperModes(true, saved, { sections: false, clustering: false })).toEqual({ sections: false, clustering: false });
    expect(newspaperModes(true, saved, { sections: true, clustering: false })).toEqual({ sections: true, clustering: false });
  });
});

describe('fitGridItems', () => {
  it('counts the items in the whole rows that fit, rows as tall as their tallest item', () => {
    // 2 columns, rows of 100 and 120 (tallest item), 16px between rows: 100 + 16 + 120 = 236
    const heights = [100, 90, 120, 80, 100, 100];
    expect(fitGridItems(236, heights, 2, 16)).toBe(4);
    expect(fitGridItems(234, heights, 2, 16)).toBe(2); // the second row would be cut by 2px: only the first
    expect(fitGridItems(100, heights, 2, 16)).toBe(2);
  });

  it('shows nothing when not even the first row fits whole', () => {
    expect(fitGridItems(98, [100, 90], 2, 16)).toBe(0);
    expect(fitGridItems(0, [100, 90], 2, 16)).toBe(0);
    expect(fitGridItems(-20, [100], 1, 0)).toBe(0);
  });

  it('stops at the items there are, a short last row included', () => {
    expect(fitGridItems(1000, [100, 100, 100], 2, 16)).toBe(3);
    expect(fitGridItems(1000, [], 2, 16)).toBe(0);
  });

  it('counts nothing that is not laid out (zero height, e.g. under display: none)', () => {
    expect(fitGridItems(0, [0, 0, 0, 0], 2, 0)).toBe(0);
    expect(fitGridItems(300, [100, 100, 0, 0], 2, 16)).toBe(2);
  });

  it('works for a single column', () => {
    expect(fitGridItems(250, [100, 100, 100], 1, 20)).toBe(2); // 100 + 20 + 100 = 220; a third needs 340
  });

  it('allows sub-pixel rounding so a row that measures a hair (≤ 1px) over still counts', () => {
    expect(fitGridItems(100, [100.4, 90], 2, 16)).toBe(2);
  });
});
