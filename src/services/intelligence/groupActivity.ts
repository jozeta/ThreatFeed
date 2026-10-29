import { LeakSiteVictim } from '../../types';

const DAY_MS = 24 * 60 * 60 * 1000;
export const ACTIVITY_WEEKS = 13;

export interface GroupActivity {
  key: string; // lowercase group name
  name: string;
  last7: number;
  last30: number;
  previous30: number; // days 31-60, for the trend
  total: number; // everything in the collected history (up to 90 days)
  weekly: number[]; // victims per week, oldest first, the last entry being the current 7 days
  lastPost: string;
  firstPost: string; // first victim in the collected history
  rank: number; // by victims in the last 30 days, 1 = most active
}

/** Per-group activity from the leak-site victims: recent counts, weekly trend and ranking */
export function groupActivity(victims: LeakSiteVictim[], now = Date.now()): Map<string, GroupActivity> {
  const byGroup = new Map<string, GroupActivity>();
  for (const v of victims) {
    const key = v.group.toLowerCase();
    const age = (now - Date.parse(v.discoveredAt)) / DAY_MS;
    if (isNaN(age) || age < 0) continue;
    const g = byGroup.get(key) ?? {
      key, name: v.group, last7: 0, last30: 0, previous30: 0, total: 0,
      weekly: new Array(ACTIVITY_WEEKS).fill(0), lastPost: v.discoveredAt, firstPost: v.discoveredAt, rank: 0,
    };
    g.total++;
    if (age < 7) g.last7++;
    if (age < 30) g.last30++;
    else if (age < 60) g.previous30++;
    const week = Math.floor(age / 7);
    if (week < ACTIVITY_WEEKS) g.weekly[ACTIVITY_WEEKS - 1 - week]++;
    if (v.discoveredAt > g.lastPost) g.lastPost = v.discoveredAt;
    if (v.discoveredAt < g.firstPost) g.firstPost = v.discoveredAt;
    byGroup.set(key, g);
  }
  [...byGroup.values()]
    .sort((a, b) => b.last30 - a.last30 || b.total - a.total)
    .forEach((g, i) => { g.rank = i + 1; });
  return byGroup;
}

/** Change in the last 30 days versus the 30 before, in percent; undefined without a comparable earlier period */
export function activityChange(g: GroupActivity, historyDays: number): number | undefined {
  if (historyDays < 60 || g.previous30 === 0) return undefined;
  return Math.round(((g.last30 - g.previous30) / g.previous30) * 100);
}
