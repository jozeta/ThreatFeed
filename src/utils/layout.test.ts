import { describe, expect, it } from 'vitest';
import { layoutLocked } from './layout';
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
