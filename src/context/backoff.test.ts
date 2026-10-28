import { describe, expect, it } from 'vitest';
import { isBackedOff } from './FeedContext';

describe('failing-feed backoff', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const health = (failures: number, minutesAgo: number) => ({
    feedId: 'f', status: 'network_error' as const, articleCount: 0, consecutiveFailures: failures,
    lastFetchedAt: new Date(now - minutesAgo * 60e3).toISOString(),
  });

  it('skips feeds after 5 straight failures, for an hour', () => {
    expect(isBackedOff(health(4, 5), now)).toBe(false);
    expect(isBackedOff(health(5, 5), now)).toBe(true);
    expect(isBackedOff(health(5, 61), now)).toBe(false);
    expect(isBackedOff(undefined, now)).toBe(false);
  });
});
