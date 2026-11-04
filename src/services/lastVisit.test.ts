import { describe, it, expect } from 'vitest';
import type { Article } from '../types';
import { visitBaseline, newSince, olderThan, formatSince, firstEarlierId } from './lastVisit';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const HOUR = 3600_000;
const art = (id: string, fetchedAt?: string, publishedAt = 'invalid') => ({ id, fetchedAt, publishedAt }) as Article;

describe('visitBaseline', () => {
  it('baseline handles first visit and future timestamps', () => {
    expect(visitBaseline(null, NOW)).toBeNull();
    expect(visitBaseline(new Date(NOW + HOUR).toISOString(), NOW)).toBe(NOW);
    expect(visitBaseline(new Date(NOW - 2 * HOUR).toISOString(), NOW)).toBe(NOW - 2 * HOUR);
  });

  it('treats an unparseable stored value as a first visit (no baseline)', () => {
    expect(visitBaseline('garbage', NOW)).toBeNull();
  });
});

describe('newSince / olderThan', () => {
  const base = NOW - 2 * HOUR;
  const fresh = art('fresh', new Date(NOW - HOUR).toISOString());
  const old = art('old', new Date(NOW - 3 * HOUR).toISOString());

  it('uses fetchedAt, falling back to publishedAt', () => {
    const pubNew = art('pubNew', undefined, new Date(NOW - HOUR).toISOString());
    const pubOld = art('pubOld', undefined, new Date(NOW - 5 * HOUR).toISOString());
    expect(newSince([fresh, old, pubNew, pubOld], base).map((a) => a.id)).toEqual(['fresh', 'pubNew']);
    expect(olderThan([fresh, old, pubNew, pubOld], base).map((a) => a.id)).toEqual(['old', 'pubOld']);
  });

  it('prefers fetchedAt over publishedAt', () => {
    const a = art('a', new Date(NOW - HOUR).toISOString(), new Date(NOW - 9 * HOUR).toISOString());
    expect(newSince([a], base)).toHaveLength(1);
  });

  it('excludes invalid dates from both sides', () => {
    const bad = art('bad', 'nope', 'also nope');
    expect(newSince([bad], base)).toEqual([]);
    expect(olderThan([bad], base)).toEqual([]);
  });
});

describe('formatSince', () => {
  it('shows HH:MM today and adds the day otherwise', () => {
    const today = new Date(2026, 10, 4, 8, 12);
    const now = new Date(2026, 10, 4, 12, 0).getTime();
    expect(formatSince(today.getTime(), now)).toBe('08:12');
    const yesterday = new Date(2026, 10, 3, 18, 5).getTime();
    expect(formatSince(yesterday, now)).toMatch(/18:05$/);
    expect(formatSince(yesterday, now)).not.toBe('18:05');
  });
});

describe('firstEarlierId', () => {
  const base = NOW - 2 * HOUR;
  const fresh = art('fresh', new Date(NOW - HOUR).toISOString());
  const old = art('old', new Date(NOW - 3 * HOUR).toISOString());

  it('marks where the new items end', () => {
    expect(firstEarlierId([fresh, fresh, old, fresh], base)).toBe('old');
  });

  it('has no divider when everything is new or everything is older', () => {
    expect(firstEarlierId([fresh], base)).toBeNull();
    expect(firstEarlierId([old, old], base)).toBeNull();
    expect(firstEarlierId([], base)).toBeNull();
  });
});
