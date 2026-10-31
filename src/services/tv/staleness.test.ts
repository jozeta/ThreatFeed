import { describe, expect, it } from 'vitest';
import { lastFreshAt, staleLevel } from './staleness';

const MIN = 60_000;
const H = 60 * MIN;

describe('staleLevel', () => {
  const now = Date.UTC(2026, 9, 31, 12, 0);
  it('is ok under an hour', () => expect(staleLevel(now - 59 * MIN, now)).toBe('ok'));
  it('is amber after an hour', () => expect(staleLevel(now - 61 * MIN, now)).toBe('amber'));
  it('is amber at exactly one hour', () => expect(staleLevel(now - H, now)).toBe('amber'));
  it('is red after three hours', () => expect(staleLevel(now - 3 * H - 1, now)).toBe('red'));
  it('is red when nothing is known', () => expect(staleLevel(null, now)).toBe('red'));
});

describe('lastFreshAt', () => {
  it('picks the newer of the refresh and the snapshot', () => {
    const refresh = new Date('2026-10-31T10:00:00Z');
    expect(lastFreshAt(refresh, '2026-10-31T11:00:00Z')).toBe(Date.parse('2026-10-31T11:00:00Z'));
    expect(lastFreshAt(refresh, '2026-10-31T09:00:00Z')).toBe(refresh.getTime());
  });
  it('uses whichever is known, null when neither', () => {
    expect(lastFreshAt(null, '2026-10-31T11:00:00Z')).toBe(Date.parse('2026-10-31T11:00:00Z'));
    expect(lastFreshAt(new Date(5), null)).toBe(5);
    expect(lastFreshAt(null, null)).toBeNull();
    expect(lastFreshAt(null, 'not a date')).toBeNull();
  });
});
