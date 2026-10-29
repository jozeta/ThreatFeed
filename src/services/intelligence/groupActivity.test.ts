import { describe, expect, it } from 'vitest';
import { activityChange, groupActivity } from './groupActivity';
import { LeakSiteVictim } from '../../types';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-30T12:00:00Z');
const victim = (group: string, daysAgo: number): LeakSiteVictim =>
  ({ id: `${group}-${daysAgo}-${Math.random()}`, victim: 'x', group, discoveredAt: new Date(now - daysAgo * DAY).toISOString() });

describe('groupActivity', () => {
  it('counts recent victims, builds the weekly trend and ranks by the last 30 days', () => {
    const stats = groupActivity([
      victim('Akira', 1), victim('Akira', 3), victim('Akira', 40), victim('Akira', 45),
      victim('Qilin', 2), victim('Qilin', 10), victim('Qilin', 12),
    ], now);
    const akira = stats.get('akira')!;
    expect([akira.last7, akira.last30, akira.previous30, akira.total]).toEqual([2, 2, 2, 4]);
    expect(akira.weekly[12]).toBe(2); // this week
    expect(akira.weekly[12 - 5]).toBe(1); // 40 days ago
    expect(stats.get('qilin')!.rank).toBe(1);
    expect(akira.rank).toBe(2);
    expect(activityChange(akira, 90)).toBe(0);
    expect(activityChange(akira, 30)).toBeUndefined(); // not enough history to compare
  });
});
