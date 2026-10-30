import { describe, expect, it } from 'vitest';
import { ransomDashboard, vulnDashboard } from './dashboard';
import { LeakSiteVictim, StatsData, StatsDay, VulnData } from '../../types';

const now = Date.parse('2026-10-30T12:00:00Z');
const H = 3600e3;
const vic = (id: string, ago: number, extra: Partial<LeakSiteVictim> = {}): LeakSiteVictim =>
  ({ id, victim: id, group: 'a', discoveredAt: new Date(now - ago).toISOString(), ...extra });
const day = (p: Partial<StatsDay> = {}): StatsDay => ({ crit: [], high: [], kev: [], exploits: [], victims: [], groups: {}, countries: {}, sectors: {}, ...p });
const stats = (days: Record<string, StatsDay>): StatsData => ({ version: 1, generatedAt: '', days });
const four = [vic('1', 1 * H), vic('2', 2 * H), vic('3', 20 * H), vic('4', 72 * H)];

describe('ransomDashboard', () => {
  it('counts 24h and 7d, delta only with history', () => {
    const r = ransomDashboard(four, null, now);
    expect(r.victims24h.value).toBe(3);
    expect(r.victims7d.value).toBe(4);
    expect(r.victims7d.delta).toBeUndefined();
    const s = stats({ '2026-10-20': day({ victims: ['x', 'y'] }) });
    expect(ransomDashboard(four, s, now).victims7d.delta).toBe(2);
  });
  it('top sector share and null', () => {
    const v = [vic('1', H, { sector: 'Health' }), vic('2', H, { sector: 'Health' }), vic('3', H, { sector: 'Tech' })];
    expect(ransomDashboard(v, null, now).topSector).toEqual({ name: 'Health', share: 67 });
    expect(ransomDashboard(four, null, now).topSector).toBeNull();
  });
  it('daily is 30 zero-filled days; new groups', () => {
    const v = [vic('1', H, { group: 'new' }), vic('2', 10 * 24 * H, { group: 'old' }), vic('3', H, { group: 'old' })];
    const r = ransomDashboard(v, null, now);
    expect(r.daily).toHaveLength(30);
    expect(r.daily[29]).toEqual({ day: '2026-10-30', count: 2 });
    expect(r.daily[0].count).toBe(0);
    expect(r.groups7d).toEqual({ value: 2, newThisWeek: 1 });
  });
  it('accepts null/empty', () => {
    const r = ransomDashboard([], null, now);
    expect(r.victims7d.value).toBe(0);
    expect(r.latest).toEqual([]);
  });
});

describe('vulnDashboard', () => {
  it('lists exploited now with KEV first, 13 weeks', () => {
    const v = {
      kev: [{ cve: 'CVE-1', vendor: 'Acme', product: 'Widget', dateAdded: '2026-10-28' }],
      notable: [{ id: 'CVE-2', published: '2026-10-29T00:00:00Z', score: 9.8, severity: 'CRITICAL', description: 'Bad thing' }],
      exploits: { 'CVE-2': { pocs: 2 } },
    } as unknown as VulnData;
    const r = vulnDashboard(v, null, null, now);
    expect(r.exploitedNow.map(e => [e.cve, e.tag])).toEqual([['CVE-1', 'KEV'], ['CVE-2', 'PoC']]);
    expect(r.exploitedNow[0].title).toBe('Acme Widget');
    expect(r.weekly).toHaveLength(13);
    expect(r.weekly[12].week).toBe('2026-10-26');
    expect(r.weekly[12]).toMatchObject({ critical: 1, kev: 1 });
    expect(r.critical7d.value).toBe(1);
  });
  it('leaves weeks before any critical data without a bar, keeping the KEV line', () => {
    const v = {
      kev: [{ cve: 'CVE-1', vendor: 'A', product: 'B', dateAdded: '2026-08-12' }],
      notable: [{ id: 'CVE-2', published: '2026-10-20T00:00:00Z', score: 9.8, severity: 'CRITICAL' }],
      exploits: {},
    } as unknown as VulnData;
    const r = vulnDashboard(v, null, null, now);
    // Oldest critical is Tue 2026-10-20, so the week of 10-19 has data and earlier weeks do not
    expect(r.weekly.map(w => w.critical === null)).toEqual([...Array(11).fill(true), false, false]);
    expect(r.weekly.find(w => w.week === '2026-08-10')).toMatchObject({ critical: null, kev: 1 });
    expect(r.weekly[11]).toMatchObject({ week: '2026-10-19', critical: 1 });
    // Stats history with an earlier non-empty crit list moves the start back
    const s = stats({ '2026-09-01': day({ crit: ['CVE-9'] }) });
    const r2 = vulnDashboard(v, null, s, now);
    expect(r2.weekly.filter(w => w.critical === null)).toHaveLength(4);
    expect(r2.weekly[4]).toMatchObject({ week: '2026-08-31', critical: 1 });
  });
  it('hides the exploits delta when notable is shallow even with a deep KEV catalog', () => {
    const v = {
      kev: [{ cve: 'CVE-1', vendor: 'A', product: 'B', dateAdded: '2022-01-05' }, { cve: 'CVE-3', vendor: 'A', product: 'B', dateAdded: '2026-10-29' }],
      notable: [{ id: 'CVE-2', published: '2026-10-28T00:00:00Z', score: 9.8, severity: 'CRITICAL' }],
      exploits: { 'CVE-2': { pocs: 1 }, 'CVE-3': { pocs: 1 } },
    } as unknown as VulnData;
    const r = vulnDashboard(v, null, stats({}), now);
    expect(r.exploits7d.value).toBe(2);
    expect(r.exploits7d.delta).toBeUndefined();
  });
  it('accepts null', () => {
    const r = vulnDashboard(null, null, null, now);
    expect(r.critical7d.value).toBe(0);
    expect(r.patchTuesday).toBeNull();
    expect(r.exploitedNow).toEqual([]);
    expect(r.weekly).toHaveLength(13);
  });
  it('summarises the latest patch month', () => {
    const msrc = { months: [{ id: '2026-Oct', title: 'October 2026 Security Updates', released: '', cves: [
      { cve: 'a', title: '', severity: 'Critical', exploited: true }, { cve: 'b', title: '', severity: 'Important', exploited: false }] }] };
    expect(vulnDashboard(null, msrc as any, null, now).patchTuesday).toEqual({ total: 2, critical: 1, zeroDays: 1, month: 'October 2026' });
  });
});
