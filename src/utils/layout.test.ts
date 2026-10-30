import { describe, expect, it } from 'vitest';
import { layoutLocked, newspaperModes } from './layout';
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
